"""
converter/utils.py
==================
Low-level utilities for loading MIT-BIH PhysioNet records.

This module wraps the `wfdb` library so that no other converter module
ever imports wfdb directly. If wfdb changes its API in a future version,
we update only this file — the rest of the pipeline is unaffected.

Responsibilities:
  - Locate raw dataset files on disk
  - Load ECG signal arrays via wfdb
  - Load beat/rhythm annotations via wfdb
  - Validate data integrity before processing begins
  - Provide shared type aliases and constants

This module has NO side effects — it only reads files, never writes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import numpy as np
import wfdb
import wfdb.processing

# =============================================================================
# MODULE LOGGER
# =============================================================================
# Each module gets its own logger, named after the module.
# This makes it easy to trace which module produced a log message.
logger = logging.getLogger(__name__)

# =============================================================================
# CONSTANTS
# =============================================================================

# MIT-BIH Arrhythmia Database sampling frequency (Hz).
# ALL records in this database are sampled at exactly 360 Hz.
# We define this as a constant so the entire pipeline agrees on one value.
MIT_BIH_FS: int = 360

# The ECG channel we use: channel 0 = Modified Lead II (MLII).
# MLII gives the clearest QRS complexes for beat detection.
# Channel 1 is V1 or V5 depending on the record — we don't use it.
ECG_CHANNEL: int = 0

# Annotation file extension for MIT-BIH beat labels.
ANNOTATION_EXT: str = "atr"

# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class ECGRecord:
    """
    Container for a fully loaded MIT-BIH ECG record.

    Attributes:
        record_id:    e.g. "100", "119", "208"
        signal:       1D numpy array of raw ADC samples (millivolts after gain)
        fs:           Sampling frequency in Hz (always 360 for MIT-BIH)
        duration_sec: Total recording duration in seconds
        n_samples:    Total number of samples in the signal
        units:        Physical unit string from header (usually "mV")
        lead_name:    Name of the ECG lead (usually "MLII")
    """

    record_id: str
    signal: np.ndarray
    fs: int
    duration_sec: float
    n_samples: int
    units: str
    lead_name: str


@dataclass
class ECGAnnotations:
    """
    Container for beat and rhythm annotations from a .atr file.

    Attributes:
        record_id:   e.g. "100"
        samples:     Array of sample indices where each beat/event occurs
        symbols:     Array of beat-type characters ('N', 'V', 'A', 'F', ...)
        aux_notes:   Array of rhythm annotation strings ('(N', '(VT', '(AFIB', ...)
                     Most entries are empty strings; rhythm changes have values.
        n_beats:     Total annotation count
    """

    record_id: str
    samples: np.ndarray         # shape: (n_beats,), dtype: int
    symbols: List[str]          # len: n_beats
    aux_notes: List[str]        # len: n_beats
    n_beats: int


# =============================================================================
# CORE LOADING FUNCTIONS
# =============================================================================


def get_dataset_dir() -> Path:
    """
    Return the absolute path to the MIT-BIH dataset directory.

    Uses __file__ to resolve the path relative to this module's location,
    so it works regardless of the current working directory.
    """
    # converter/utils.py → parent is converter/ → parent.parent is project root
    return Path(__file__).parent.parent / "datasets" / "mit-bih"


def get_record_path(record_id: str) -> Path:
    """
    Return the path prefix for a given record (without extension).
    wfdb uses this prefix to find .hea, .dat, .atr files automatically.

    Example:
        get_record_path("100")
        → Path("d:/ecg/.../datasets/mit-bih/100")
        wfdb then loads:
            datasets/mit-bih/100.hea
            datasets/mit-bih/100.dat
    """
    return get_dataset_dir() / record_id


def validate_record_files(record_id: str) -> None:
    """
    Check that all three required files for a record exist on disk.
    Raises FileNotFoundError with a helpful message if any are missing.

    This must be called before loading to give the user a clear error
    rather than a cryptic wfdb exception.
    """
    dataset_dir = get_dataset_dir()
    required_extensions = [".hea", ".dat", ".atr"]

    missing: List[str] = []
    for ext in required_extensions:
        fpath = dataset_dir / f"{record_id}{ext}"
        if not fpath.exists():
            missing.append(str(fpath))

    if missing:
        raise FileNotFoundError(
            f"Record {record_id}: Missing required files:\n"
            + "\n".join(f"  {f}" for f in missing)
            + "\n\nRun:  python scripts/download_dataset.py"
        )

    logger.debug(f"Record {record_id}: All required files present.")


def load_record(record_id: str) -> ECGRecord:
    """
    Load the ECG signal from a MIT-BIH record into an ECGRecord dataclass.

    Steps:
      1. Validate files exist
      2. Call wfdb.rdrecord() to parse .hea and .dat
      3. Extract channel 0 (MLII) signal
      4. Convert from 2D array (n_samples × n_channels) to 1D
      5. Return typed ECGRecord

    Args:
        record_id: MIT-BIH record number as string (e.g. "100")

    Returns:
        ECGRecord with signal in physical units (mV)

    Raises:
        FileNotFoundError: If dataset files are not downloaded
        ValueError: If the record has no valid signal data
    """
    validate_record_files(record_id)

    record_path = str(get_record_path(record_id))
    logger.info(f"Loading record {record_id} from {record_path}...")

    # wfdb.rdrecord() reads the .hea header then loads .dat binary signal.
    # p_signal gives the physical signal in millivolts (after applying gain).
    # d_signal would give raw ADC integers — we always use p_signal.
    raw = wfdb.rdrecord(record_path, channels=[ECG_CHANNEL])

    if raw.p_signal is None or raw.p_signal.size == 0:
        raise ValueError(f"Record {record_id}: No signal data found.")

    # p_signal shape is (n_samples, n_channels). We loaded only channel 0,
    # so we flatten to a 1D array with [:, 0].
    signal_1d: np.ndarray = raw.p_signal[:, 0].astype(np.float64)

    n_samples = len(signal_1d)
    duration_sec = n_samples / raw.fs
    units = raw.units[0] if raw.units else "mV"
    lead_name = raw.sig_name[0] if raw.sig_name else "MLII"

    ecg = ECGRecord(
        record_id=record_id,
        signal=signal_1d,
        fs=raw.fs,
        duration_sec=duration_sec,
        n_samples=n_samples,
        units=units,
        lead_name=lead_name,
    )

    logger.info(
        f"Loaded record {record_id}: "
        f"{n_samples:,} samples, "
        f"{duration_sec:.1f}s, "
        f"fs={raw.fs}Hz, "
        f"lead={lead_name}"
    )
    return ecg


def load_annotations(record_id: str) -> ECGAnnotations:
    """
    Load beat and rhythm annotations from a MIT-BIH .atr file.

    Annotation symbols (common ones):
        'N'  = Normal beat
        'V'  = Premature ventricular contraction (PVC)
        'A'  = Atrial premature beat
        'F'  = Fusion of ventricular and normal beat
        'L'  = Left bundle branch block beat
        'R'  = Right bundle branch block beat
        '+'  = Rhythm change (check aux_note for details)
        '|'  = Isolated QRS-like artifact

    Rhythm aux_note values (when symbol == '+'):
        '(N'    = Normal sinus rhythm
        '(VT'   = Ventricular tachycardia
        '(VFL'  = Ventricular flutter
        '(AFIB' = Atrial fibrillation
        '(AFL'  = Atrial flutter
        '(B'    = Ventricular bigeminy

    Args:
        record_id: MIT-BIH record number as string

    Returns:
        ECGAnnotations dataclass

    Raises:
        FileNotFoundError: If .atr file not found
    """
    validate_record_files(record_id)

    record_path = str(get_record_path(record_id))
    logger.info(f"Loading annotations for record {record_id}...")

    ann = wfdb.rdann(record_path, ANNOTATION_EXT)

    # aux_note can contain trailing whitespace or null chars — strip them
    aux_notes_clean = [
        (note.strip() if note else "") for note in ann.aux_note
    ]

    annotations = ECGAnnotations(
        record_id=record_id,
        samples=ann.sample,
        symbols=ann.symbol,
        aux_notes=aux_notes_clean,
        n_beats=len(ann.symbol),
    )

    # Log a symbol frequency summary for debugging
    from collections import Counter
    symbol_counts = Counter(ann.symbol)
    logger.info(
        f"Annotations for {record_id}: "
        f"{annotations.n_beats} total — "
        + ", ".join(f"{sym}={cnt}" for sym, cnt in symbol_counts.most_common(8))
    )

    return annotations


# =============================================================================
# HELPER UTILITIES
# =============================================================================


def get_beat_indices(
    annotations: ECGAnnotations,
    symbol: str,
) -> List[int]:
    """
    Return the annotation indices (NOT sample positions) where a given
    beat symbol occurs.

    Example:
        indices = get_beat_indices(ann, 'V')
        # ann.samples[indices[0]] is the sample position of the first PVC

    Args:
        annotations: Loaded ECGAnnotations object
        symbol:      Beat type to search for (e.g. 'N', 'V', 'A')

    Returns:
        List of annotation index positions where symbol matches
    """
    return [i for i, s in enumerate(annotations.symbols) if s == symbol]


def get_rhythm_segments(
    annotations: ECGAnnotations,
    rhythm_label: str,
    ecg: ECGRecord,
) -> List[tuple[int, int]]:
    """
    Find contiguous signal segments where a specific rhythm is active.

    Rhythm changes are marked in aux_note when symbol == '+'.
    This function finds all start/end sample pairs for the requested rhythm.

    Args:
        annotations:   Loaded annotations
        rhythm_label:  Rhythm aux_note to search for (e.g. '(VT', '(AFIB')
        ecg:           Loaded ECG record (needed for total sample count)

    Returns:
        List of (start_sample, end_sample) tuples
    """
    segments: List[tuple[int, int]] = []
    in_target_rhythm = False
    seg_start = 0

    for i, (sample, note) in enumerate(
        zip(annotations.samples, annotations.aux_notes)
    ):
        if note.startswith(rhythm_label):
            # Start of target rhythm
            if not in_target_rhythm:
                in_target_rhythm = True
                seg_start = int(sample)

        elif note and note != rhythm_label and in_target_rhythm:
            # Start of a different rhythm — close the segment
            segments.append((seg_start, int(sample)))
            in_target_rhythm = False

    # If recording ends while still in target rhythm, close the last segment
    if in_target_rhythm:
        segments.append((seg_start, ecg.n_samples))

    logger.debug(
        f"Found {len(segments)} '{rhythm_label}' segment(s) in record {annotations.record_id}"
    )
    return segments
