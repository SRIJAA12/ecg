"""
converter/extract.py
====================
Beat and rhythm segment extraction from MIT-BIH ECG records.

This module contains one extractor function per rhythm type. Each function:
  1. Receives a loaded ECGRecord + ECGAnnotations
  2. Locates the best representative segment for that rhythm
  3. Returns a raw (un-normalized) signal slice as a numpy array

Design principle: Each extractor is independent and testable in isolation.
The normalize and export modules receive the output of these extractors.

Extraction strategy per rhythm:
  - Sinus (100):  3 consecutive Normal ('N') beats from a stable region
  - PVC   (119):  1 Normal beat + 1 PVC beat + 1 Normal beat (shows the ectopy)
  - AFib  (202):  5 beats from inside an (AFIB rhythm segment (shows irregularity)
  - VT    (207):  4 beats from inside a (VT rhythm segment
  - VF    (208):  2.0 seconds from inside a (VFL rhythm segment (chaotic)
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

import numpy as np

from .utils import (
    ECGAnnotations,
    ECGRecord,
    get_beat_indices,
    get_rhythm_segments,
    MIT_BIH_FS,
)

logger = logging.getLogger(__name__)

# =============================================================================
# EXTRACTION RESULT
# =============================================================================


class ExtractionResult:
    """
    Holds a raw extracted ECG segment and metadata about it.

    Attributes:
        signal:            1D numpy float64 array, raw millivolt values
        fs:                Sampling frequency (Hz)
        beat_duration_ms:  Duration of ONE representative cardiac cycle in ms.
                           The React player uses this to scale playback speed
                           when the user changes heart rate.
        rhythm:            String identifier for this rhythm
        record_id:         Source MIT-BIH record number
        description:       Human-readable description
    """

    def __init__(
        self,
        signal: np.ndarray,
        fs: int,
        beat_duration_ms: float,
        rhythm: str,
        record_id: str,
        description: str,
    ) -> None:
        self.signal = signal
        self.fs = fs
        self.beat_duration_ms = beat_duration_ms
        self.rhythm = rhythm
        self.record_id = record_id
        self.description = description
        self.num_samples = len(signal)
        self.duration_ms = (self.num_samples / fs) * 1000.0

    def __repr__(self) -> str:
        return (
            f"ExtractionResult(rhythm={self.rhythm!r}, "
            f"samples={self.num_samples}, "
            f"duration={self.duration_ms:.0f}ms, "
            f"beat={self.beat_duration_ms:.0f}ms)"
        )


# =============================================================================
# INTERNAL HELPERS
# =============================================================================


def _extract_window(
    signal: np.ndarray,
    start_sample: int,
    end_sample: int,
    label: str,
) -> np.ndarray:
    """
    Slice signal[start:end] with bounds checking.
    Logs a warning if the window extends past the signal boundary.
    """
    n = len(signal)
    start_clamped = max(0, start_sample)
    end_clamped = min(n, end_sample)

    if start_clamped != start_sample or end_clamped != end_sample:
        logger.warning(
            f"[{label}] Window clamped: requested [{start_sample}:{end_sample}] "
            f"→ [{start_clamped}:{end_clamped}] (signal length={n})"
        )

    window = signal[start_clamped:end_clamped].copy()

    if len(window) == 0:
        raise ValueError(
            f"[{label}] Empty extraction window after clamping. "
            f"Check dataset integrity."
        )

    return window


def _compute_beat_duration_ms(
    annotations: ECGAnnotations,
    beat_index: int,
    fs: int,
    n_beats_ahead: int = 4,
) -> float:
    """
    Compute mean beat duration by averaging N consecutive R-R intervals
    starting from beat_index.

    We average multiple intervals rather than using a single R-R because
    individual intervals can be noisy (motion artifact, ectopic beats).
    Averaging 4 gives a stable representative value.

    Args:
        annotations:    Beat annotations
        beat_index:     Starting annotation index
        fs:             Sampling rate (Hz)
        n_beats_ahead:  Number of intervals to average

    Returns:
        Mean R-R interval in milliseconds
    """
    samples = annotations.samples

    # Gather up to n_beats_ahead consecutive intervals
    intervals_samples = []
    for i in range(beat_index, min(beat_index + n_beats_ahead, len(samples) - 1)):
        rr = int(samples[i + 1]) - int(samples[i])
        if rr > 0:
            intervals_samples.append(rr)

    if not intervals_samples:
        # Fallback: assume 72 bpm
        logger.warning("Could not compute R-R intervals, using 833ms default (72 bpm)")
        return 833.0

    mean_rr_samples = np.mean(intervals_samples)
    mean_rr_ms = (mean_rr_samples / fs) * 1000.0
    logger.debug(f"Mean R-R: {mean_rr_ms:.1f}ms from {len(intervals_samples)} intervals")
    return float(mean_rr_ms)


# =============================================================================
# RHYTHM EXTRACTORS
# =============================================================================


def extract_sinus(ecg: ECGRecord, annotations: ECGAnnotations) -> ExtractionResult:
    """
    Extract a sinus (Normal) rhythm template from MIT-BIH Record 100.

    Strategy:
      - Find all Normal ('N') beat annotations
      - Skip the first 50 beats (signal is noisier at recording start)
      - Pick a stable middle region: 3 consecutive N beats
      - Extract from the R-peak of beat[i] to the R-peak of beat[i+3]
        (this captures exactly 3 complete cycles with clean QRS + T waves)

    Why 3 beats?
      The React animation loops this segment. With 3 beats, the loop transition
      is smoother (less visible seam) than with just 1 beat.

    beat_duration_ms: Mean of the 3 R-R intervals in the extracted window.
    """
    rhythm = "sinus"
    record_id = ecg.record_id
    n_cycles = 3  # Number of complete beats to extract

    # Find all Normal beats
    normal_indices = get_beat_indices(annotations, "N")

    if len(normal_indices) < n_cycles + 55:
        raise ValueError(
            f"Record {record_id}: Too few Normal beats "
            f"({len(normal_indices)}) to extract {n_cycles} cycles."
        )

    # Skip first 50 beats — beginning of recording often has noise/artifacts
    start_ann_idx = normal_indices[50]
    # Verify the next n_cycles beats are also Normal (no ectopy in window)
    # Walk forward to find a clean run of consecutive Normal beats
    clean_start = _find_clean_run(annotations, normal_indices, 50, n_cycles)

    r_start = int(annotations.samples[clean_start])
    r_end   = int(annotations.samples[clean_start + n_cycles])

    signal_window = _extract_window(ecg.signal, r_start, r_end, rhythm)

    beat_duration_ms = _compute_beat_duration_ms(
        annotations, clean_start, ecg.fs, n_cycles
    )

    logger.info(
        f"[{rhythm}] Extracted {len(signal_window)} samples "
        f"({len(signal_window)/ecg.fs*1000:.0f}ms), "
        f"beat={beat_duration_ms:.0f}ms"
    )

    return ExtractionResult(
        signal=signal_window,
        fs=ecg.fs,
        beat_duration_ms=beat_duration_ms,
        rhythm=rhythm,
        record_id=record_id,
        description="Normal Sinus Rhythm — 3 consecutive beats from Record 100",
    )


def extract_pvc(ecg: ECGRecord, annotations: ECGAnnotations) -> ExtractionResult:
    """
    Extract a PVC (Premature Ventricular Contraction) template from Record 119.

    Strategy:
      - Find all PVC ('V') beat annotations
      - Select a PVC that has Normal beats before and after it
        (most PVCs in record 119 follow this pattern: N N V N N)
      - Extract: from the beat BEFORE the PVC to the beat AFTER the PVC
        → This gives context: [Normal][PVC][Normal] which shows:
          1. Normal narrow QRS
          2. Wide bizarre PVC morphology
          3. Compensatory pause
          4. Return to Normal

    beat_duration_ms: R-R interval of the Normal beats surrounding the PVC.
    The PVC itself is shorter (premature) — we use the surrounding Normal rate
    so heart rate scaling remains physiologically accurate.
    """
    rhythm = "pvc"
    record_id = ecg.record_id

    # Find all PVC annotation indices
    pvc_ann_indices = get_beat_indices(annotations, "V")

    if len(pvc_ann_indices) < 1:
        raise ValueError(f"Record {record_id}: No PVC ('V') beats found.")

    # Pick a PVC in the middle of the recording for signal quality
    target_pvc_idx = pvc_ann_indices[len(pvc_ann_indices) // 2]

    # Go back 1 beat for pre-PVC normal context
    start_ann = max(0, target_pvc_idx - 1)
    # Go forward 2 beats for post-PVC normal + compensatory pause
    end_ann = min(len(annotations.samples) - 1, target_pvc_idx + 2)

    r_start = int(annotations.samples[start_ann])
    r_end   = int(annotations.samples[end_ann])

    signal_window = _extract_window(ecg.signal, r_start, r_end, rhythm)

    # Use the surrounding Normal R-R for beat_duration (not the premature interval)
    # Look at the beat BEFORE the pre-PVC beat for a clean Normal interval
    normal_ref = max(0, start_ann - 1)
    beat_duration_ms = _compute_beat_duration_ms(
        annotations, normal_ref, ecg.fs, n_beats_ahead=2
    )

    logger.info(
        f"[{rhythm}] Extracted {len(signal_window)} samples "
        f"({len(signal_window)/ecg.fs*1000:.0f}ms), "
        f"beat={beat_duration_ms:.0f}ms"
    )

    return ExtractionResult(
        signal=signal_window,
        fs=ecg.fs,
        beat_duration_ms=beat_duration_ms,
        rhythm=rhythm,
        record_id=record_id,
        description="PVC — [Normal][PVC][Normal] pattern with compensatory pause from Record 119",
    )


def extract_afib(ecg: ECGRecord, annotations: ECGAnnotations) -> ExtractionResult:
    """
    Extract an Atrial Fibrillation (AFib) segment from Record 202.

    Strategy:
      - Scan aux_notes for '(AFIB' rhythm label
      - Find the longest AFib segment for best signal quality
      - Extract 5 beats from the middle of that segment
        (5 beats clearly demonstrates the irregular R-R intervals)

    Key AFib characteristics to show:
      - Absent P waves (replaced by fibrillatory baseline)
      - Irregularly irregular R-R intervals
      - Normal QRS morphology (unless aberrant conduction)

    beat_duration_ms: Mean R-R of the 5 extracted beats.
    Note: In AFib, beat_duration_ms represents the average ventricular rate.
    """
    rhythm = "afib"
    record_id = ecg.record_id
    n_cycles = 5

    # Find AFib rhythm segments
    afib_segments = get_rhythm_segments(annotations, "(AFIB", ecg)

    if not afib_segments:
        # Fallback: try (AF label
        afib_segments = get_rhythm_segments(annotations, "(AF", ecg)

    if not afib_segments:
        raise ValueError(
            f"Record {record_id}: No '(AFIB' rhythm segments found in annotations."
        )

    # Use the longest AFib segment for best representative quality
    longest_seg = max(afib_segments, key=lambda s: s[1] - s[0])
    seg_start_sample, seg_end_sample = longest_seg

    logger.debug(
        f"[{rhythm}] AFib segment: samples {seg_start_sample}–{seg_end_sample} "
        f"({(seg_end_sample - seg_start_sample)/ecg.fs:.1f}s)"
    )

    # Find annotation indices that fall inside this segment
    beat_indices_in_seg = [
        i for i, s in enumerate(annotations.samples)
        if seg_start_sample <= s <= seg_end_sample
    ]

    if len(beat_indices_in_seg) < n_cycles + 2:
        raise ValueError(
            f"Record {record_id}: AFib segment too short to extract {n_cycles} beats."
        )

    # Take beats from middle of segment for stable signal
    mid = len(beat_indices_in_seg) // 2
    start_beat_idx = beat_indices_in_seg[mid]
    end_beat_idx   = beat_indices_in_seg[mid + n_cycles]

    r_start = int(annotations.samples[start_beat_idx])
    r_end   = int(annotations.samples[end_beat_idx])

    signal_window = _extract_window(ecg.signal, r_start, r_end, rhythm)

    beat_duration_ms = _compute_beat_duration_ms(
        annotations, start_beat_idx, ecg.fs, n_cycles
    )

    logger.info(
        f"[{rhythm}] Extracted {len(signal_window)} samples "
        f"({len(signal_window)/ecg.fs*1000:.0f}ms), "
        f"beat={beat_duration_ms:.0f}ms"
    )

    return ExtractionResult(
        signal=signal_window,
        fs=ecg.fs,
        beat_duration_ms=beat_duration_ms,
        rhythm=rhythm,
        record_id=record_id,
        description="Atrial Fibrillation — 5 beats showing irregular R-R from Record 202",
    )


def extract_vt(ecg: ECGRecord, annotations: ECGAnnotations) -> ExtractionResult:
    """
    Extract a Ventricular Tachycardia (VT) segment from Record 207.

    Strategy:
      - Scan aux_notes for '(VT' rhythm label
      - Find the longest VT run (several seconds of sustained VT)
      - Extract 4 consecutive VT beats from the middle of that run

    Key VT characteristics to show:
      - Rapid rate (>100 bpm, usually 140–250 bpm)
      - Wide, bizarre QRS complexes (>120ms)
      - Regular R-R intervals (monomorphic VT)
      - AV dissociation (P waves dissociated from QRS)

    beat_duration_ms: Mean R-R within the VT run (reflects the fast rate).
    """
    rhythm = "vt"
    record_id = ecg.record_id
    n_cycles = 4

    # Find VT rhythm segments
    vt_segments = get_rhythm_segments(annotations, "(VT", ecg)

    if not vt_segments:
        raise ValueError(
            f"Record {record_id}: No '(VT' rhythm segments found in annotations."
        )

    # Prefer the longest VT run for clearest morphology
    longest_vt = max(vt_segments, key=lambda s: s[1] - s[0])
    seg_start_sample, seg_end_sample = longest_vt

    logger.debug(
        f"[{rhythm}] VT segment: samples {seg_start_sample}–{seg_end_sample} "
        f"({(seg_end_sample - seg_start_sample)/ecg.fs:.1f}s)"
    )

    # Find annotation indices inside VT segment
    beat_indices_in_seg = [
        i for i, s in enumerate(annotations.samples)
        if seg_start_sample <= s <= seg_end_sample
    ]

    if len(beat_indices_in_seg) < n_cycles + 2:
        # If the longest segment is too short, try all segments combined
        logger.warning(
            f"[{rhythm}] Longest VT segment has only {len(beat_indices_in_seg)} beats. "
            f"Trying shorter segments..."
        )
        for seg in sorted(vt_segments, key=lambda s: s[1] - s[0], reverse=True):
            beat_indices_in_seg = [
                i for i, s in enumerate(annotations.samples)
                if seg[0] <= s <= seg[1]
            ]
            if len(beat_indices_in_seg) >= n_cycles + 2:
                seg_start_sample, seg_end_sample = seg
                break
        else:
            raise ValueError(
                f"Record {record_id}: No VT segment has enough beats ({n_cycles} required)."
            )

    # Take from the middle of the segment
    mid = len(beat_indices_in_seg) // 2
    start_beat_idx = beat_indices_in_seg[mid]
    end_beat_idx   = beat_indices_in_seg[mid + n_cycles]

    r_start = int(annotations.samples[start_beat_idx])
    r_end   = int(annotations.samples[end_beat_idx])

    signal_window = _extract_window(ecg.signal, r_start, r_end, rhythm)

    beat_duration_ms = _compute_beat_duration_ms(
        annotations, start_beat_idx, ecg.fs, n_cycles
    )

    logger.info(
        f"[{rhythm}] Extracted {len(signal_window)} samples "
        f"({len(signal_window)/ecg.fs*1000:.0f}ms), "
        f"beat={beat_duration_ms:.0f}ms"
    )

    return ExtractionResult(
        signal=signal_window,
        fs=ecg.fs,
        beat_duration_ms=beat_duration_ms,
        rhythm=rhythm,
        record_id=record_id,
        description="Ventricular Tachycardia — 4 VT beats from sustained run in Record 207",
    )


def extract_vf(ecg: ECGRecord, annotations: ECGAnnotations) -> ExtractionResult:
    """
    Extract a Ventricular Fibrillation (VF) segment from Record 208.

    Strategy:
      - VF has NO organized beats — we cannot use R-peak annotations.
      - Instead, we scan aux_notes for '(VFL' (ventricular flutter/fibrillation)
      - Extract a fixed 2.0-second window from the middle of the VF segment
        (2 seconds of VF waveform clearly shows the chaotic undulating baseline)

    Key VF characteristics to show:
      - No organized P waves or QRS complexes
      - Chaotic irregular oscillations (150–500 Hz dominant frequency)
      - Varying amplitude

    beat_duration_ms: Set to 200ms (equivalent to 300 bpm) — the fastest
    physiologically meaningful rate. Used by the React player for scaling.
    In practice, VF ignores heart rate — the waveform is always chaotic.
    """
    rhythm = "vf"
    record_id = ecg.record_id
    vf_duration_sec = 2.0  # How much VF to extract (seconds)

    # MIT-BIH record 208 uses '(VFL' for ventricular flutter/fibrillation
    vf_segments = get_rhythm_segments(annotations, "(VFL", ecg)

    if not vf_segments:
        # Some records use '(VF' without the L
        vf_segments = get_rhythm_segments(annotations, "(VF", ecg)

    if not vf_segments:
        raise ValueError(
            f"Record {record_id}: No '(VFL' or '(VF' rhythm segments found."
        )

    # Use the longest VF segment
    longest_vf = max(vf_segments, key=lambda s: s[1] - s[0])
    seg_start_sample, seg_end_sample = longest_vf
    seg_duration = (seg_end_sample - seg_start_sample) / ecg.fs

    logger.debug(
        f"[{rhythm}] VF segment: {seg_start_sample}–{seg_end_sample} "
        f"({seg_duration:.1f}s)"
    )

    if seg_duration < vf_duration_sec:
        logger.warning(
            f"[{rhythm}] VF segment ({seg_duration:.1f}s) shorter than "
            f"requested {vf_duration_sec}s. Using entire segment."
        )
        vf_duration_sec = seg_duration * 0.8  # Use 80% of available

    # Extract from the middle of the VF segment for best signal quality
    seg_mid_sample = (seg_start_sample + seg_end_sample) // 2
    n_samples_to_extract = int(vf_duration_sec * ecg.fs)
    r_start = seg_mid_sample - n_samples_to_extract // 2
    r_end   = r_start + n_samples_to_extract

    signal_window = _extract_window(ecg.signal, r_start, r_end, rhythm)

    # VF has no meaningful beat duration — use 200ms as canonical placeholder
    beat_duration_ms = 200.0

    logger.info(
        f"[{rhythm}] Extracted {len(signal_window)} samples "
        f"({len(signal_window)/ecg.fs*1000:.0f}ms)"
    )

    return ExtractionResult(
        signal=signal_window,
        fs=ecg.fs,
        beat_duration_ms=beat_duration_ms,
        rhythm=rhythm,
        record_id=record_id,
        description="Ventricular Fibrillation — 2s of chaotic signal from Record 208",
    )


# =============================================================================
# INTERNAL HELPER
# =============================================================================


def _find_clean_run(
    annotations: ECGAnnotations,
    normal_indices: list[int],
    start_search: int,
    n_consecutive: int,
) -> int:
    """
    Find the annotation index of the start of a run of n_consecutive
    Normal beats with no ectopic beats in between.

    This ensures our sinus template doesn't accidentally include a PVC
    or other ectopic beat in the middle.

    Args:
        annotations:    Full annotation set
        normal_indices: Indices into annotations where symbol == 'N'
        start_search:   Start searching from this position in normal_indices
        n_consecutive:  Required number of consecutive Normal beats

    Returns:
        Annotation index (into annotations.samples) of the run start
    """
    for pos in range(start_search, len(normal_indices) - n_consecutive):
        ann_idx = normal_indices[pos]

        # Check that the next n_consecutive entries in annotations are all 'N'
        all_normal = all(
            annotations.symbols[ann_idx + k] == "N"
            for k in range(n_consecutive + 1)
        )

        if all_normal:
            return ann_idx

    # Fallback: return the start_search position even if not perfectly clean
    logger.warning(
        "Could not find perfectly clean Normal run. Using best available."
    )
    return normal_indices[start_search]
