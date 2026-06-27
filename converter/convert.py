"""
converter/convert.py
====================
Main ECG conversion pipeline for the Healthcare Simulation Monitor.

This is the single entry point for the entire Python signal processing pipeline.
Run this script AFTER downloading the dataset with scripts/download_dataset.py.

Usage:
    python converter/convert.py

What it does:
  For each of the 5 rhythm types:
    1. Load the raw ECG record from datasets/mit-bih/
    2. Load the beat/rhythm annotations
    3. Extract the best representative waveform segment
    4. Normalize the signal to [-1.0, +1.0]
    5. Export JSON to:
         waveform-library/{rhythm}.json
         frontend/public/waveforms/ecg/{rhythm}.json
    6. Validate the exported file

Output files:
    waveform-library/sinus.json
    waveform-library/pvc.json
    waveform-library/afib.json
    waveform-library/vt.json
    waveform-library/vf.json
    (+ copies in frontend/public/waveforms/ecg/)
"""

from __future__ import annotations

import io
import logging
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional

# ── Windows UTF-8 fix ─────────────────────────────────────────────────────────
# Prevent UnicodeEncodeError on Windows cp1252 terminals
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Pipeline imports ──────────────────────────────────────────────────────────
from converter.utils import load_record, load_annotations
from converter.extract import (
    ExtractionResult,
    extract_sinus,
    extract_pvc,
    extract_afib,
    extract_vt,
    extract_vf,
)
from converter.normalize import normalize
from converter.export import export, validate_json_output, FRONTEND_WAVEFORM_DIR


# =============================================================================
# LOGGING
# =============================================================================


def setup_logging() -> None:
    """Configure clean logging to stdout only (no file handler for this script)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)-8s %(message)s",
        stream=sys.stdout,
    )
    # Suppress wfdb's own verbose output
    logging.getLogger("wfdb").setLevel(logging.WARNING)


# =============================================================================
# PIPELINE DEFINITION
# =============================================================================


@dataclass
class RhythmConfig:
    """
    Configuration for one rhythm type in the conversion pipeline.

    Attributes:
        rhythm:     Short identifier used in filenames (e.g., "sinus")
        record_id:  MIT-BIH record number to load (e.g., "100")
        extractor:  The extract_* function to call for this rhythm
        label:      Human-readable name for log messages
    """
    rhythm: str
    record_id: str
    extractor: Callable
    label: str


# The complete list of rhythms to process.
# Order matters: we process sinus first as a sanity-check baseline.
RHYTHM_PIPELINE: List[RhythmConfig] = [
    RhythmConfig(
        rhythm="sinus",
        record_id="100",
        extractor=extract_sinus,
        label="Normal Sinus Rhythm",
    ),
    RhythmConfig(
        rhythm="pvc",
        record_id="119",
        extractor=extract_pvc,
        label="Premature Ventricular Contraction",
    ),
    RhythmConfig(
        rhythm="afib",
        record_id="202",
        extractor=extract_afib,
        label="Atrial Fibrillation",
    ),
    RhythmConfig(
        rhythm="vt",
        record_id="207",
        extractor=extract_vt,
        label="Ventricular Tachycardia",
    ),
    RhythmConfig(
        rhythm="vf",
        record_id="207",   # 207 has (VFL annotations; 208 has only (N and (T (trigeminy)
        extractor=extract_vf,
        label="Ventricular Fibrillation",
    ),
]


# =============================================================================
# PIPELINE RUNNER
# =============================================================================


@dataclass
class PipelineResult:
    """Result of processing one rhythm through the pipeline."""
    rhythm: str
    label: str
    success: bool
    output_path: Optional[Path] = None
    error: Optional[str] = None
    duration_sec: float = 0.0


def run_pipeline_for_rhythm(config: RhythmConfig) -> PipelineResult:
    """
    Execute the full pipeline for one rhythm:
      load → extract → normalize → export → validate

    Args:
        config: RhythmConfig specifying what to process and how

    Returns:
        PipelineResult with success/failure and output path
    """
    logger = logging.getLogger(__name__)
    t_start = time.monotonic()

    logger.info("")
    logger.info(f"{'=' * 60}")
    logger.info(f"  [{config.rhythm.upper()}]  {config.label}")
    logger.info(f"  Record: {config.record_id}")
    logger.info(f"{'=' * 60}")

    try:
        # ── Step 1: Load ECG signal ───────────────────────────────────────────
        ecg = load_record(config.record_id)

        # ── Step 2: Load annotations ──────────────────────────────────────────
        annotations = load_annotations(config.record_id)

        # ── Step 3: Extract waveform segment ──────────────────────────────────
        extraction: ExtractionResult = config.extractor(ecg, annotations)
        logger.info(f"  Extracted: {extraction}")

        # ── Step 4: Normalize signal ──────────────────────────────────────────
        normalized = normalize(extraction)
        logger.info(
            f"  Normalized: {normalized.num_samples} samples, "
            f"duration={normalized.duration_ms:.0f}ms, "
            f"beat={normalized.beat_duration_ms:.0f}ms"
        )

        # ── Step 5: Export JSON ───────────────────────────────────────────────
        written_paths = export(normalized)
        output_path = written_paths["frontend"]

        # ── Step 6: Validate output ───────────────────────────────────────────
        valid = validate_json_output(output_path, config.rhythm)
        if not valid:
            raise RuntimeError(f"Validation failed for {output_path}")

        duration = time.monotonic() - t_start
        logger.info(f"  [OK] Done in {duration:.2f}s")

        return PipelineResult(
            rhythm=config.rhythm,
            label=config.label,
            success=True,
            output_path=output_path,
            duration_sec=duration,
        )

    except FileNotFoundError as e:
        error_msg = f"Dataset not found: {e}"
        logger.error(f"  [FAIL] {error_msg}")
        return PipelineResult(
            rhythm=config.rhythm,
            label=config.label,
            success=False,
            error=error_msg,
            duration_sec=time.monotonic() - t_start,
        )

    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        logger.error(f"  [FAIL] {error_msg}")
        logger.debug("  Full traceback:", exc_info=True)
        return PipelineResult(
            rhythm=config.rhythm,
            label=config.label,
            success=False,
            error=error_msg,
            duration_sec=time.monotonic() - t_start,
        )


# =============================================================================
# SUMMARY REPORT
# =============================================================================


def print_summary(results: List[PipelineResult]) -> None:
    """Print a structured summary table after all rhythms are processed."""
    logger = logging.getLogger(__name__)

    passed = [r for r in results if r.success]
    failed = [r for r in results if not r.success]

    logger.info("")
    logger.info("=" * 60)
    logger.info("CONVERSION SUMMARY")
    logger.info("=" * 60)

    for r in results:
        status = "[OK]  " if r.success else "[FAIL]"
        logger.info(f"  {status}  {r.rhythm:<8}  {r.label}")
        if not r.success:
            logger.info(f"         Error: {r.error}")

    logger.info("-" * 60)
    logger.info(f"  Passed: {len(passed)} / {len(results)}")
    logger.info(f"  Failed: {len(failed)} / {len(results)}")
    logger.info(f"  Output: {FRONTEND_WAVEFORM_DIR.resolve()}")
    logger.info("=" * 60)

    if failed:
        logger.warning("")
        logger.warning("Some rhythms failed. Common causes:")
        logger.warning("  1. Dataset not downloaded yet.")
        logger.warning("     Run: python scripts/download_dataset.py")
        logger.warning("  2. Partial download. Re-run the downloader.")
    else:
        logger.info("")
        logger.info("[SUCCESS] All waveforms generated.")
        logger.info("Next step: Start the React frontend with:")
        logger.info("  cd frontend && npm install && npm run dev")


# =============================================================================
# ENTRY POINT
# =============================================================================


def main() -> int:
    """
    Run the full conversion pipeline for all rhythm types.

    Returns:
        Exit code: 0 = all succeeded, 1 = one or more failed
    """
    setup_logging()
    logger = logging.getLogger(__name__)

    logger.info("")
    logger.info("Healthcare Simulation Monitor — ECG Converter")
    logger.info("MIT-BIH Arrhythmia Database  →  JSON Waveforms")
    logger.info(f"Rhythms to process: {len(RHYTHM_PIPELINE)}")
    logger.info("")

    results: List[PipelineResult] = []

    for config in RHYTHM_PIPELINE:
        result = run_pipeline_for_rhythm(config)
        results.append(result)

    print_summary(results)

    # Return exit code 1 if any rhythm failed (useful for CI/CD pipelines)
    any_failed = any(not r.success for r in results)
    return 1 if any_failed else 0


if __name__ == "__main__":
    sys.exit(main())
