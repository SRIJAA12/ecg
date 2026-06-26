"""
converter/export.py
====================
JSON serialization and file export for normalized ECG waveforms.

This module takes a NormalizedSignal and writes it to:
  1. waveform-library/{rhythm}.json        — master output (git-ignored)
  2. frontend/public/waveforms/ecg/{rhythm}.json — served by Vite dev server

Why two destinations?
  - waveform-library/ is the canonical generated output.
    Any build tooling or backend can read from here.
  - frontend/public/waveforms/ecg/ is served statically by Vite.
    React's fetch() or axios can load these files at runtime without a backend.
    This is the "no backend" architecture required for Phase 1.

JSON Schema produced:
  {
    "rhythm":           "sinus",              // rhythm identifier
    "record":           "100",                // MIT-BIH record number
    "description":      "Normal Sinus...",    // human readable
    "sample_rate":      360,                  // Hz
    "num_samples":      1080,                 // number of data points
    "duration_ms":      3000.0,               // total duration in ms
    "beat_duration_ms": 833.3,                // one cardiac cycle in ms
    "generated_at":     "2024-01-01T12:00Z", // ISO8601 timestamp
    "signal":           [0.12, 0.15, ...]     // normalized float array
  }
"""

from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

from .normalize import NormalizedSignal

logger = logging.getLogger(__name__)


# =============================================================================
# OUTPUT PATHS
# =============================================================================

# Project root is two levels above converter/
_PROJECT_ROOT = Path(__file__).parent.parent

# Primary output: master waveform library
WAVEFORM_LIBRARY_DIR = _PROJECT_ROOT / "waveform-library"

# Secondary output: served by Vite for the React frontend
FRONTEND_WAVEFORM_DIR = _PROJECT_ROOT / "frontend" / "public" / "waveforms" / "ecg"


# =============================================================================
# SERIALIZATION
# =============================================================================


def to_dict(normalized: NormalizedSignal) -> Dict[str, Any]:
    """
    Convert a NormalizedSignal into a plain Python dict ready for JSON serialization.

    The signal array is converted from numpy float64 to a Python list of Python floats.
    This is required because json.dumps() cannot serialize numpy types directly.
    """
    return {
        # ── Identity ──────────────────────────────────────────────────────────
        "rhythm": normalized.rhythm,
        "record": normalized.record_id,
        "description": normalized.description,
        # ── Timing / Playback ─────────────────────────────────────────────────
        "sample_rate": normalized.fs,
        "num_samples": normalized.num_samples,
        "duration_ms": round(normalized.duration_ms, 2),
        "beat_duration_ms": round(normalized.beat_duration_ms, 2),
        # ── Provenance ────────────────────────────────────────────────────────
        # ISO8601 timestamp so the React app knows when this was generated.
        # Using UTC (timezone.utc) for consistency across machines.
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "MIT-BIH Arrhythmia Database — PhysioNet v1.0.0",
        # ── Raw metadata (for debugging / future use) ─────────────────────────
        "raw_min_mv": round(normalized.raw_min_mv, 4),
        "raw_max_mv": round(normalized.raw_max_mv, 4),
        # ── Signal data ───────────────────────────────────────────────────────
        # tolist() converts numpy array → Python list of Python floats.
        # This is the payload the React canvas will iterate over to draw.
        "signal": normalized.signal.tolist(),
    }


# =============================================================================
# FILE EXPORT
# =============================================================================


def export(normalized: NormalizedSignal) -> Dict[str, Path]:
    """
    Export a NormalizedSignal to JSON files in both output destinations.

    Args:
        normalized: NormalizedSignal from the normalize module

    Returns:
        Dict mapping destination name → Path of the written file.
        E.g.: {"waveform_library": Path(...), "frontend": Path(...)}

    Raises:
        OSError: If file cannot be written (permissions, disk full, etc.)
    """
    # Build the payload dict
    payload = to_dict(normalized)
    rhythm = normalized.rhythm
    filename = f"{rhythm}.json"

    # Pretty-print with separators=(',', ': ') for readability in dev tools.
    # In production we'd minify, but for a development phase readable JSON
    # is far more valuable — engineers can inspect files directly.
    json_str = json.dumps(payload, indent=2, separators=(",", ": "))

    written: Dict[str, Path] = {}

    # ── Write to waveform-library/ ────────────────────────────────────────────
    WAVEFORM_LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    lib_path = WAVEFORM_LIBRARY_DIR / filename
    _write_file(lib_path, json_str)
    written["waveform_library"] = lib_path
    logger.info(f"  Wrote: {lib_path}")

    # ── Copy to frontend/public/waveforms/ecg/ ────────────────────────────────
    FRONTEND_WAVEFORM_DIR.mkdir(parents=True, exist_ok=True)
    fe_path = FRONTEND_WAVEFORM_DIR / filename
    shutil.copy2(lib_path, fe_path)
    written["frontend"] = fe_path
    logger.info(f"  Copied: {fe_path}")

    return written


def _write_file(path: Path, content: str) -> None:
    """
    Write text content to a file atomically using a temp file.

    If writing fails midway (disk full, etc.), the original file at `path`
    is not corrupted. We only replace it after the write succeeds.
    """
    temp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        # Write to temp
        temp_path.write_text(content, encoding="utf-8")
        # Atomic replace
        temp_path.replace(path)
    except Exception:
        # Clean up temp file on failure
        if temp_path.exists():
            temp_path.unlink()
        raise


# =============================================================================
# VALIDATION (for use after export)
# =============================================================================


def validate_json_output(path: Path, expected_rhythm: str) -> bool:
    """
    Read back the written JSON and perform basic sanity checks.
    Called after export() to confirm the file is valid and loadable.

    Checks:
      - File exists and is non-empty
      - JSON is valid (parseable)
      - Required keys are present
      - Signal array is non-empty
      - All signal values are in [-1.0, +1.0]

    Returns:
        True if all checks pass, False otherwise (logs errors on failure).
    """
    if not path.exists() or path.stat().st_size == 0:
        logger.error(f"Validation FAILED: {path} does not exist or is empty.")
        return False

    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Validation FAILED: {path} is not valid JSON: {e}")
        return False

    required_keys = ["rhythm", "record", "sample_rate", "num_samples",
                     "duration_ms", "beat_duration_ms", "signal"]
    for key in required_keys:
        if key not in data:
            logger.error(f"Validation FAILED: {path} missing key '{key}'")
            return False

    signal = data["signal"]

    if not signal:
        logger.error(f"Validation FAILED: {path} has empty signal array.")
        return False

    # Check value bounds
    out_of_range = [v for v in signal if not (-1.001 <= v <= 1.001)]
    if out_of_range:
        logger.error(
            f"Validation FAILED: {path} has {len(out_of_range)} values "
            f"outside [-1, +1]. First offender: {out_of_range[0]}"
        )
        return False

    if data["rhythm"] != expected_rhythm:
        logger.error(
            f"Validation FAILED: Expected rhythm '{expected_rhythm}', "
            f"got '{data['rhythm']}'"
        )
        return False

    logger.debug(f"Validation PASSED: {path.name} ({len(signal)} samples)")
    return True
