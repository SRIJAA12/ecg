"""
backend/engine/waveform_generator.py
=====================================
Gaussian PQRST ECG synthesis engine.

Architecture:
  ECG(t) = P(t) + Q(t) + R(t) + S(t) + T(t) + ST_offset(t)

Each wave: W(t) = A * exp(-(t - μ)² / (2·σ²))
  t is normalised to [0, 1] within one RR interval.

The generator maintains phase state across calls so the signal is
perfectly continuous even when parameters change mid-stream.
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from models.ecg_state import ECGState, RhythmType, TransferFn
from engine.rhythm_intelligence import get_wave_visibility


# ─── Wave descriptor ──────────────────────────────────────────────────────────

@dataclass
class Wave:
    amp:    float   # mV amplitude  (negative = downward)
    center: float   # position in beat [0, 1]
    sigma:  float   # Gaussian width (fraction of RR)


@dataclass
class BeatParams:
    """All Gaussian parameters for one beat."""
    p:  Wave | None   # None → no P wave (AFib, VT, etc.)
    q:  Wave
    r:  Wave
    s:  Wave
    t:  Wave
    rr_jitter:   float = 0.0    # RR variability fraction (σ of multiplicative noise)
    st_slope:    float = 0.0    # baseline ST offset (mV) — overridden by ECGState
    qrs_extra_width: float = 0.0  # extra Gaussian width for wide QRS rhythms (LBBB, RBBB, VT)


@dataclass
class RhythmTransition:
    source: RhythmType
    target: RhythmType
    duration_s: float
    fn: TransferFn
    elapsed_s: float = 0.0

    @property
    def done(self) -> bool:
        return self.elapsed_s >= self.duration_s


# ─── Default NSR parameters ───────────────────────────────────────────────────
#   (t in [0,1] is fraction of RR interval)
#   Normal: PR≈160ms, QRS≈80ms, QT≈400ms at 70 bpm → RR≈857ms
#   Fractions: P@0.13, QRS@0.38-0.48, T@0.60

def _nsr() -> BeatParams:
    return BeatParams(
        p = Wave( 0.15,  0.13, 0.030),
        q = Wave(-0.05,  0.38, 0.012),
        r = Wave( 1.00,  0.41, 0.015),
        s = Wave(-0.15,  0.44, 0.012),
        t = Wave( 0.30,  0.65, 0.060),
    )


# ─── Rhythm → BeatParams factory ─────────────────────────────────────────────

def get_beat_params(state: ECGState, rhythm: RhythmType | None = None) -> BeatParams:
    # Coerce rhythm to enum if it's a raw string (can happen after state updates)
    try:
        source_rhythm = state.rhythm if rhythm is None else rhythm
        r = RhythmType(source_rhythm) if not isinstance(source_rhythm, RhythmType) else source_rhythm
    except ValueError:
        r = RhythmType.NSR

    # ── Pure morphology rhythms ──────────────────────────────────────────────
    if r in (RhythmType.NSR, RhythmType.PAC):
        return _nsr()

    if r == RhythmType.SINUS_BRADY:
        # Slower sinus activation commonly makes P and T waves more distinct.
        bp = _nsr()
        bp.p = Wave(0.17, 0.12, 0.026)
        bp.t = Wave(0.34, 0.62, 0.055)
        return bp

    if r == RhythmType.SINUS_TACHY:
        # Physiological rate compression: P approaches the preceding T wave.
        bp = _nsr()
        bp.p = Wave(0.12, 0.11, 0.025)
        bp.t = Wave(0.24, 0.61, 0.050)
        return bp

    if r == RhythmType.PEA:
        # PEA retains organised electrical activity; low-voltage morphology
        # distinguishes the teaching trace while the absent pulse is clinical.
        bp = _nsr()
        bp.p = Wave(0.10, 0.13, 0.030)
        bp.r = Wave(0.65, 0.41, 0.018)
        bp.s = Wave(-0.12, 0.45, 0.014)
        bp.t = Wave(0.18, 0.66, 0.065)
        return bp

    if r == RhythmType.AFIB:
        # No P wave, irregular baseline flutter added in noise engine
        bp = _nsr()
        bp.p = None
        bp.rr_jitter = 0.20   # irregular RR
        return bp

    if r == RhythmType.AFLUTTER:
        # Sawtooth P waves (approximate with inverted P at 300 bpm)
        bp = _nsr()
        bp.p = Wave(-0.20, 0.10, 0.045)   # inverted, broader
        return bp

    if r == RhythmType.JUNCTIONAL:
        # Retrograde P (inverted, after QRS)
        bp = _nsr()
        bp.p = Wave(-0.10, 0.55, 0.020)
        return bp

    if r == RhythmType.AVB1:
        # Prolonged PR — shift QRS & T forward relative to P
        bp = _nsr()
        pr_fraction = state.pr_interval / 1000.0 * state.heart_rate / 60.0
        shift = min(pr_fraction - 0.19, 0.15)   # shift QRS/T right
        bp.q.center += shift
        bp.r.center += shift
        bp.s.center += shift
        bp.t.center += shift
        return bp

    if r in (RhythmType.AVB2_I, RhythmType.AVB2_II):
        # Handled beat-level in rhythm_engine; morphology same as NSR
        return _nsr()

    if r == RhythmType.AVB3:
        # P waves dissociated — drawn separately; QRS is ventricular escape
        bp = _nsr()
        bp.r.amp = 0.60   # slightly smaller escape QRS
        bp.qrs_extra_width = 0.010
        return bp

    if r == RhythmType.PVC:
        # Wide bizarre QRS, no P, compensatory pause handled in rhythm_engine
        return BeatParams(
            p = None,
            q = Wave(-0.20,  0.35, 0.025),
            r = Wave( 1.20,  0.42, 0.030),
            s = Wave(-0.40,  0.50, 0.025),
            t = Wave(-0.25,  0.70, 0.080),  # T discordant with QRS
            qrs_extra_width=0.020,
        )

    if r == RhythmType.SVT:
        # Normal narrow QRS, P buried in T or absent
        bp = _nsr()
        bp.p = None
        bp.r.amp = 0.90
        return bp

    if r == RhythmType.VT:
        # Wide bizarre QRS, no P, rapid
        return BeatParams(
            p = None,
            q = Wave(-0.15,  0.35, 0.025),
            r = Wave( 1.30,  0.43, 0.035),
            s = Wave(-0.50,  0.53, 0.030),
            t = Wave(-0.30,  0.72, 0.090),
            qrs_extra_width=0.025,
        )

    if r == RhythmType.VF:
        # Handled entirely in rhythm_engine as chaotic oscillation
        return _nsr()   # placeholder, not used

    if r == RhythmType.TORSADES:
        return BeatParams(
            p = None,
            q = Wave(-0.20,  0.35, 0.030),
            r = Wave( 1.50,  0.43, 0.040),
            s = Wave(-0.60,  0.55, 0.030),
            t = Wave(-0.40,  0.75, 0.090),
            qrs_extra_width=0.030,
            rr_jitter=0.08,
        )

    if r == RhythmType.ASYSTOLE:
        return BeatParams(
            p=None,
            q=Wave(0, 0.38, 0.01),
            r=Wave(0, 0.41, 0.01),
            s=Wave(0, 0.44, 0.01),
            t=Wave(0, 0.65, 0.01),
        )

    if r == RhythmType.LBBB:
        # Notched R in lateral leads, wide QRS
        return BeatParams(
            p = Wave( 0.15,  0.13, 0.030),
            q = Wave(-0.03,  0.36, 0.010),
            r = Wave( 0.90,  0.42, 0.035),   # broad R
            s = Wave(-0.05,  0.50, 0.010),
            t = Wave(-0.20,  0.72, 0.070),   # discordant T
            qrs_extra_width=0.025,
        )

    if r == RhythmType.RBBB:
        # RSR' in V1, wide S in I/V5/V6
        return BeatParams(
            p = Wave( 0.15,  0.13, 0.030),
            q = Wave(-0.05,  0.38, 0.012),
            r = Wave( 1.00,  0.41, 0.020),
            s = Wave(-0.30,  0.52, 0.018),   # deep wide S
            t = Wave( 0.25,  0.68, 0.060),
            qrs_extra_width=0.018,
        )

    if r in (RhythmType.ANT_STEMI, RhythmType.INF_STEMI, RhythmType.LAT_STEMI):
        bp = _nsr()
        return bp   # ST handled by lead_generator using state.st_elevation

    # fallback
    return _nsr()


# ─── Generator ────────────────────────────────────────────────────────────────

class WaveformGenerator:
    """
    Maintains continuous phase state and generates ECG samples on demand.
    Thread-safe assumption: called only from the simulation loop.
    """

    def __init__(self, fs: int = 512):
        self.fs = fs
        self._phase: float = 0.0         # [0, 1) within one RR interval
        self._rr_history: list[float] = []
        self._beat_count: int = 0
        self._rr_factor: float = 1.0
        self._avb2_counter: int = 0      # for Wenckebach pattern
        self._torsades_axis: float = 0.0 # twisting axis angle
        self._vf_clock: float = 0.0
        self._atrial_clock: float = 0.0
        self._rhythm_transition: RhythmTransition | None = None

    def begin_rhythm_transition(
        self,
        source: RhythmType,
        target: RhythmType,
        duration_s: float,
        fn: TransferFn,
    ) -> None:
        source_rhythm = self._coerce_rhythm(source)
        target_rhythm = self._coerce_rhythm(target)
        if source_rhythm == target_rhythm or fn == TransferFn.IMMEDIATE or duration_s <= 0.0:
            self._rhythm_transition = None
            return
        self._rhythm_transition = RhythmTransition(source_rhythm, target_rhythm, duration_s, fn)

    def clear_rhythm_transition(self) -> None:
        self._rhythm_transition = None

    def generate(self, state: ECGState, n_samples: int) -> np.ndarray:
        """
        Generate `n_samples` of ECG signal (Lead II reference).
        Returns float32 array normalised to approximately ±1.0 mV.
        """
        signal = np.zeros(n_samples, dtype=np.float32)
        target_rhythm = self._coerce_rhythm(state.rhythm)
        transition = self._rhythm_transition

        # A zero intrinsic rate is electrical standstill regardless of the
        # selected morphology. The engine loop continues emitting flat packets.
        if state.heart_rate <= 0.0:
            return signal
        if transition is not None and transition.done:
            self._rhythm_transition = None
            transition = None

        if transition is None and target_rhythm == RhythmType.VF:
            return self._vf(n_samples)
        if transition is None and target_rhythm == RhythmType.ASYSTOLE:
            return signal

        params_target = get_beat_params(state, target_rhythm)
        params_source = get_beat_params(state, transition.source) if transition is not None else params_target
        beat_start_pending = self._phase == 0.0

        for i in range(n_samples):
            if transition is not None:
                mix = self._transition_mix(transition)
                source_sample = self._sample_for_rhythm_or_special(
                    self._phase, params_source, state, transition.source
                )
                target_sample = self._sample_for_rhythm_or_special(
                    self._phase, params_target, state, transition.target
                )
                signal[i] = (1.0 - mix) * source_sample + mix * target_sample
                transition.elapsed_s = min(transition.elapsed_s + (1.0 / self.fs), transition.duration_s)
                if transition.done:
                    self._rhythm_transition = None
                    transition = None
            else:
                signal[i] = self._sample_for_rhythm_or_special(
                    self._phase, params_target, state, target_rhythm
                )

            rr_sec = self._rr(state, target_rhythm)
            if beat_start_pending:
                self._on_beat_start(state, params_target, target_rhythm)
                beat_start_pending = False

            self._phase += 1.0 / (rr_sec * self.fs)
            if self._phase >= 1.0:
                self._phase -= 1.0
                self._beat_count += 1
                self._rr_factor = self._choose_rr_factor(state, target_rhythm)
                beat_start_pending = True

        return signal

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _coerce_rhythm(self, rhythm: RhythmType | str | None) -> RhythmType:
        try:
            if rhythm is None:
                return RhythmType.NSR
            return RhythmType(rhythm) if not isinstance(rhythm, RhythmType) else rhythm
        except ValueError:
            return RhythmType.NSR

    def _get_rhythm(self, state: ECGState) -> RhythmType:
        """Safely coerce state.rhythm to RhythmType enum."""
        return self._coerce_rhythm(state.rhythm)

    def _rr(self, state: ECGState, rhythm: RhythmType | None = None) -> float:
        """Compute RR interval with HRV jitter."""
        if state.heart_rate <= 0.0:
            return float("inf")
        hr = state.heart_rate
        rr_mean = 60.0 / hr
        params = get_beat_params(state, rhythm)
        rhythm = self._coerce_rhythm(rhythm if rhythm is not None else state.rhythm)

        # AFib: irregular RR (uniform jitter ±20%)
        # Dataset-informed PVC cadence: two conducted beats, an early wide
        # ventricular beat, then a compensatory pause.
        if rhythm == RhythmType.PVC:
            cycle = self._beat_count % 4
            if cycle == 2:
                return rr_mean * 0.62
            if cycle == 3:
                return rr_mean * 1.38

        # General HRV
        return max(rr_mean * self._rr_factor, 0.20)  # floor at 0.2s (300 bpm)

    def _choose_rr_factor(self, state: ECGState, rhythm: RhythmType) -> float:
        """Choose variability once per beat so each RR interval is stable."""
        rhythm = self._coerce_rhythm(rhythm)
        if rhythm == RhythmType.AFIB:
            return float(np.random.uniform(0.80, 1.20))
        params = get_beat_params(state, rhythm)
        sigma = params.rr_jitter + state.hrv_std
        return float(max(np.random.normal(1.0, sigma), 0.65))

    def _on_beat_start(self, state: ECGState, params: BeatParams, rhythm: RhythmType | None = None) -> None:
        """Actions at the start of each new beat."""
        rhythm = self._coerce_rhythm(rhythm if rhythm is not None else state.rhythm)
        # Wenckebach: track dropped beats
        if rhythm == RhythmType.AVB2_I:
            self._avb2_counter = (self._avb2_counter + 1) % 4
        # Torsades: rotate QRS axis slowly
        if rhythm == RhythmType.TORSADES:
            self._torsades_axis += 0.15

    def _sample_for_rhythm(self, t: float, params: BeatParams, state: ECGState, rhythm: RhythmType) -> float:
        """Evaluate the sum of Gaussian waves at normalised position t ∈ [0,1]."""
        rhythm = self._coerce_rhythm(rhythm)

        # PVC is an ectopic event, not a continuous all-PVC waveform.
        if rhythm == RhythmType.PVC and self._beat_count % 4 != 2:
            params = _nsr()

        # Wenckebach: every 4th beat has no QRS
        if rhythm == RhythmType.AVB2_I and self._avb2_counter == 3:
            # Only P wave (if beat = dropped)
            rr_sec = self._rr(state, rhythm)
            pr_sec = state.pr_interval / 1000.0
            c_r = params.r.center
            p_offset_sec = -0.12 - pr_sec
            p_center = c_r + p_offset_sec / rr_sec
            p_sigma = params.p.sigma / rr_sec if params.p else 0.030 / rr_sec
            val = 0.0
            if params.p:
                val += _gauss(t, Wave(params.p.amp, p_center, p_sigma))
            return val

        # Get current RR interval in seconds for scaling
        rr_sec = self._rr(state, rhythm)

        # Scale QRS (Q, R, S) to have constant width in seconds
        c_r = params.r.center
        qrs_duration_scale = state.qrs_duration / 80.0
        
        q_offset_sec = (params.q.center - c_r) * qrs_duration_scale
        s_offset_sec = (params.s.center - c_r) * qrs_duration_scale
        
        q_center = c_r + q_offset_sec / rr_sec
        s_center = c_r + s_offset_sec / rr_sec
        
        q_sigma = (params.q.sigma * qrs_duration_scale) / rr_sec
        r_sigma = (params.r.sigma * qrs_duration_scale) / rr_sec
        s_sigma = (params.s.sigma * qrs_duration_scale) / rr_sec

        # Scale P wave to honor state.pr_interval and have constant width in seconds
        pr_sec = state.pr_interval / 1000.0
        p_offset_sec = -0.12 - pr_sec
        p_center = c_r + p_offset_sec / rr_sec
        p_sigma = params.p.sigma / rr_sec if params.p else 0.030 / rr_sec

        # Scale T wave to scale with sqrt(rr_sec) (Bazett's formula) and honor state.qt_interval
        qt_scale = state.qt_interval / 400.0
        t_offset_sec = (params.t.center - c_r) * qt_scale * np.sqrt(rr_sec)
        t_center = c_r + t_offset_sec / rr_sec
        t_sigma = (params.t.sigma * qt_scale * np.sqrt(rr_sec)) / rr_sec

        # Adaptive wave visibility: scale P and T amplitudes by rhythm + rate factors
        p_factor, t_factor = get_wave_visibility(rhythm, state.heart_rate)

        # AVB3: dissociated P waves
        if rhythm == RhythmType.AVB3:
            p_phase = (t * 40.0 / 75.0) % 1.0
            p_val = _gauss(p_phase, Wave(0.12 * p_factor, 0.13, 0.028 / 0.8))
        else:
            p_amp = (params.p.amp * p_factor) if params.p else 0.0
            p_val = _gauss(t, Wave(p_amp, p_center, p_sigma)) if params.p else 0.0

        # Torsades: rotate QRS amplitude with beat
        r_amp_mod = 1.0
        if rhythm == RhythmType.TORSADES:
            r_amp_mod = np.sin(self._torsades_axis)

        # Scale secondary deflections for LBBB / RBBB QRS complexes to match QRS scaling
        extra_r_val = 0.0
        if rhythm == RhythmType.LBBB:
            extra_center = c_r + (0.08 * qrs_duration_scale) / rr_sec
            extra_sigma = (0.024 * qrs_duration_scale) / rr_sec
            extra_r_val = _gauss(t, Wave(0.34, extra_center, extra_sigma))
        elif rhythm == RhythmType.RBBB:
            extra_center = c_r + (0.08 * qrs_duration_scale) / rr_sec
            extra_sigma = (0.018 * qrs_duration_scale) / rr_sec
            extra_r_val = _gauss(t, Wave(0.48, extra_center, extra_sigma))

        q_val = _gauss(t, Wave(params.q.amp, q_center, q_sigma))
        r_extra_width_scaled = params.qrs_extra_width / rr_sec
        r_val = _gauss(t, Wave(params.r.amp * r_amp_mod, c_r, r_sigma + r_extra_width_scaled)) + extra_r_val
        s_val = _gauss(t, Wave(params.s.amp, s_center, s_sigma))
        t_val = _gauss(t, Wave(params.t.amp * t_factor, t_center, t_sigma))

        # Create scaled params for ST offset computation
        scaled_params = BeatParams(
            p=None,
            q=Wave(params.q.amp, q_center, q_sigma),
            r=Wave(params.r.amp, c_r, r_sigma),
            s=Wave(params.s.amp, s_center, s_sigma),
            t=Wave(params.t.amp, t_center, t_sigma)
        )
        st_offset = _st_offset(t, scaled_params, state, rr_sec)

        return p_val + q_val + r_val + s_val + t_val + st_offset

    def _sample_for_rhythm_or_special(
        self, t: float, params: BeatParams, state: ECGState, rhythm: RhythmType
    ) -> float:
        """Sample ordinary and non-PQRST rhythms through the same transition path."""
        rhythm = self._coerce_rhythm(rhythm)
        if rhythm == RhythmType.VF:
            return self._vf_sample()
        if rhythm == RhythmType.ASYSTOLE:
            return 0.0
        sample = self._sample_for_rhythm(t, params, state, rhythm)
        if rhythm == RhythmType.AFIB:
            # Fine, continuous 6–9 Hz fibrillatory baseline; no organised P.
            sample += (
                0.025 * np.sin(2 * np.pi * 6.3 * self._atrial_clock)
                + 0.015 * np.sin(2 * np.pi * 8.1 * self._atrial_clock + 0.7)
            )
            self._atrial_clock += 1.0 / self.fs
        return float(sample)

    def _transition_mix(self, transition: RhythmTransition) -> float:
        if transition.duration_s <= 0.0 or transition.fn == TransferFn.IMMEDIATE:
            return 1.0
        progress = min(max(transition.elapsed_s / transition.duration_s, 0.0), 1.0)
        match transition.fn:
            case TransferFn.LINEAR:
                return progress
            case TransferFn.EXPONENTIAL:
                return 1.0 - np.exp(-5.0 * progress)
            case TransferFn.SIGMOID:
                return 1.0 / (1.0 + np.exp(-10.0 * (progress - 0.5)))
            case _:
                return progress

    def _vf_sample(self) -> float:
        value = (
            0.6 * np.sin(2 * np.pi * 4.5 * self._vf_clock + 0.1) +
            0.4 * np.sin(2 * np.pi * 6.1 * self._vf_clock + 0.7) +
            0.3 * np.sin(2 * np.pi * 7.3 * self._vf_clock + 1.2) +
            0.15 * np.random.randn()
        )
        self._vf_clock += 1.0 / self.fs
        return float(value)

    def _vf(self, n_samples: int) -> np.ndarray:
        """Ventricular fibrillation: chaotic oscillation."""
        return np.array([self._vf_sample() for _ in range(n_samples)], dtype=np.float32)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _gauss(t: float, wave: Wave | None) -> float:
    if wave is None or wave.amp == 0:
        return 0.0
    val = 0.0
    for offset in (-1.0, 0.0, 1.0):
        val += wave.amp * np.exp(-0.5 * ((t + offset - wave.center) / wave.sigma) ** 2)
    return val


def _st_offset(t: float, params: BeatParams, state: ECGState, rr_sec: float = 1.0) -> float:
    """Add a flat ST offset between S wave and T wave."""
    st_start = params.s.center + 2 * params.s.sigma
    t_end    = params.t.center + 2 * params.t.sigma
    if st_start < t < t_end:
        elevation = state.st_elevation - state.st_depression
        width = 0.04 / rr_sec
        return elevation * np.exp(-0.5 * ((t - (st_start + t_end) / 2) / width) ** 2)
    return 0.0
