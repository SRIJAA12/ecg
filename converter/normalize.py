"""
converter/normalize.py
======================
Signal normalization for ECG waveform data.

Raw ECG signals from wfdb are in physical units (millivolts).
The React canvas renderer needs values in the range [-1.0, +1.0]
so it can map samples to pixel heights reliably.

Normalization strategy:
  - We use min-max normalization scaled to [-1.0, +1.0]
  - We preserve the signal's zero-crossing position (isoelectric line)
  - We clip outliers before normalizing to prevent rare spikes from
    compressing the main signal visually

Why NOT z-score (mean/std) normalization?
  Z-score centers the signal at 0 but does not bound it to [-1, 1].
  A canvas renderer needs hard bounds. Min-max is correct here.

Why NOT normalize each beat individually?
  If we normalized each beat in isolation, every beat would look identical
  in amplitude. Real ECG shows amplitude variation (especially in arrhythmias).
  We normalize the entire extracted window together, preserving relative amplitudes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from .extract import ExtractionResult

logger = logging.getLogger(__name__)


# =============================================================================
# NORMALIZATION RESULT
# =============================================================================


@dataclass
class NormalizedSignal:
    """
    A normalized ECG signal ready for JSON export.

    Attributes:
        signal:           1D float64 array, values in [-1.0, +1.0]
        fs:               Sampling frequency (Hz)
        beat_duration_ms: Duration of one cardiac cycle (ms) — passed through from extraction
        rhythm:           Rhythm identifier string
        record_id:        Source MIT-BIH record
        description:      Human-readable description
        raw_min_mv:       Original signal minimum before normalization (for debugging)
        raw_max_mv:       Original signal maximum before normalization (for debugging)
        num_samples:      Number of samples
        duration_ms:      Total duration of this segment in milliseconds
    """

    signal: np.ndarray
    fs: int
    beat_duration_ms: float
    rhythm: str
    record_id: str
    description: str
    raw_min_mv: float
    raw_max_mv: float
    num_samples: int
    duration_ms: float


# =============================================================================
# NORMALIZATION
# =============================================================================

# Percentile-based clipping thresholds.
# We clip the top and bottom 1% of values before computing the normalization range.
# This prevents rare noise spikes from forcing the normalization range to be
# much wider than the actual ECG signal, which would compress the QRS visually.
CLIP_LOWER_PERCENTILE: float = 1.0
CLIP_UPPER_PERCENTILE: float = 99.0


def normalize(extraction: ExtractionResult) -> NormalizedSignal:
    """
    Normalize a raw extracted ECG signal to the range [-1.0, +1.0].

    Steps:
      1. Record raw min/max for debugging/logging
      2. Clip outliers at 1st and 99th percentile
      3. Apply min-max normalization: (x - min) / (max - min) * 2 - 1
         This maps: min → -1.0, max → +1.0, midpoint → 0.0
      4. Replace any NaN values with 0.0 (guard against degenerate signals)
      5. Clip final output to hard [-1.0, +1.0] range

    Args:
        extraction: ExtractionResult from the extract module

    Returns:
        NormalizedSignal with signal in [-1.0, +1.0]

    Raises:
        ValueError: If signal is empty or all values are identical
    """
    raw = extraction.signal.astype(np.float64)

    if len(raw) == 0:
        raise ValueError(f"[{extraction.rhythm}] Cannot normalize empty signal.")

    raw_min = float(np.min(raw))
    raw_max = float(np.max(raw))

    logger.debug(
        f"[{extraction.rhythm}] Raw signal: "
        f"min={raw_min:.4f}mV, max={raw_max:.4f}mV, "
        f"range={raw_max - raw_min:.4f}mV"
    )

    # ── Step 1: Clip outliers ─────────────────────────────────────────────────
    # Compute percentile bounds on the raw signal
    p_low  = float(np.percentile(raw, CLIP_LOWER_PERCENTILE))
    p_high = float(np.percentile(raw, CLIP_UPPER_PERCENTILE))
    clipped = np.clip(raw, p_low, p_high)

    # ── Step 2: Min-max normalize to [-1.0, +1.0] ────────────────────────────
    sig_min = float(np.min(clipped))
    sig_max = float(np.max(clipped))
    sig_range = sig_max - sig_min

    if sig_range < 1e-9:
        # Flat signal (e.g., asystole simulation) — return all zeros
        logger.warning(
            f"[{extraction.rhythm}] Signal range is essentially zero "
            f"({sig_range:.2e}mV). Returning flat signal."
        )
        normalized = np.zeros_like(clipped)
    else:
        # Map [sig_min, sig_max] → [0, 1] → [-1, +1]
        normalized = (clipped - sig_min) / sig_range * 2.0 - 1.0

    # ── Step 3: Safety guards ─────────────────────────────────────────────────
    # Replace any NaN/Inf that could cause JSON serialization errors
    nan_count = int(np.sum(~np.isfinite(normalized)))
    if nan_count > 0:
        logger.warning(
            f"[{extraction.rhythm}] Replaced {nan_count} NaN/Inf values with 0.0"
        )
        normalized = np.where(np.isfinite(normalized), normalized, 0.0)

    # Hard clip to [-1.0, +1.0] (handles any floating-point edge cases)
    normalized = np.clip(normalized, -1.0, 1.0)

    # ── Step 4: Round to 5 decimal places ────────────────────────────────────
    # Reduces JSON file size significantly without perceptible quality loss.
    # At 360 Hz and canvas resolution, the 5th decimal place is invisible.
    normalized = np.round(normalized, decimals=5)

    num_samples = len(normalized)
    duration_ms = (num_samples / extraction.fs) * 1000.0

    logger.info(
        f"[{extraction.rhythm}] Normalized: "
        f"{num_samples} samples, "
        f"range=[{float(normalized.min()):.3f}, {float(normalized.max()):.3f}], "
        f"duration={duration_ms:.0f}ms"
    )

    return NormalizedSignal(
        signal=normalized,
        fs=extraction.fs,
        beat_duration_ms=extraction.beat_duration_ms,
        rhythm=extraction.rhythm,
        record_id=extraction.record_id,
        description=extraction.description,
        raw_min_mv=raw_min,
        raw_max_mv=raw_max,
        num_samples=num_samples,
        duration_ms=duration_ms,
    )
