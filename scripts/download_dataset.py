"""
scripts/download_dataset.py
"""  # noqa — real docstring below

# ── Windows UTF-8 fix ────────────────────────────────────────────────────────
# Windows terminals default to cp1252, which cannot encode Unicode symbols
# like ✓ ✗ ⚠.  We force UTF-8 on stdout/stderr before any logging is set up.
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

"""
scripts/download_dataset.py
============================
Automatic MIT-BIH Arrhythmia Database Downloader.

This script connects to PhysioNet and downloads the specific ECG records
required by the Healthcare Simulation Monitor. It is designed to be:

  - Idempotent  : Safe to run multiple times. Already-downloaded files are skipped.
  - Resumable   : Partially downloaded files are detected and re-downloaded cleanly.
  - Offline-safe: After first run, the app works entirely from local files.
  - Traceable   : Every download action is logged with timestamps.

Usage:
    python scripts/download_dataset.py

Output:
    datasets/mit-bih/{record}.hea
    datasets/mit-bih/{record}.dat
    datasets/mit-bih/{record}.atr

Data Source:
    MIT-BIH Arrhythmia Database
    https://physionet.org/content/mitdb/1.0.0/

Citation:
    Moody GB, Mark RG. The impact of the MIT-BIH Arrhythmia Database.
    IEEE Eng in Med and Biol 20(3):45-50 (May-June 2001).
"""

import os
import time
import logging
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple

import requests
from tqdm import tqdm

# =============================================================================
# CONFIGURATION
# =============================================================================

# Base URL for PhysioNet MIT-BIH Arrhythmia Database (version 1.0.0)
# We pin the version to guarantee reproducibility across all environments.
PHYSIONET_BASE_URL = "https://physionet.org/files/mitdb/1.0.0"

# Local destination folder (relative to project root)
# This path is git-ignored — raw data is never committed.
DATASET_DIR = Path(__file__).parent.parent / "datasets" / "mit-bih"

# Each record requires three file extensions that wfdb needs to read signals.
# .hea = header (metadata), .dat = binary samples, .atr = beat annotations
RECORD_EXTENSIONS = [".hea", ".dat", ".atr"]

# ─── ECG Records Required for Phase 1 ────────────────────────────────────────
# We download only what we need — not the entire 48-record database.
#
# Record selection rationale:
#   100  → Clean normal sinus rhythm  (our baseline / reference)
#   119  → Contains frequent PVCs     (Premature Ventricular Contractions)
#   202  → Contains atrial flutter and AFib segments
#   207  → Contains VT runs           (Ventricular Tachycardia)
#   208  → Contains VF episodes       (Ventricular Fibrillation)
#
REQUIRED_RECORDS: Dict[str, str] = {
    "100": "Normal Sinus Rhythm",
    "119": "Premature Ventricular Contractions (PVC)",
    "202": "Atrial Fibrillation (AFib)",
    "207": "Ventricular Tachycardia (VT)",
    "208": "Ventricular Fibrillation (VF)",
}

# HTTP request settings
TIMEOUT_SECONDS = 30          # Connection + read timeout per request
CHUNK_SIZE_BYTES = 8192       # Stream download in 8 KB chunks
MAX_RETRIES = 3               # Retry failed downloads this many times
RETRY_DELAY_SECONDS = 5       # Wait between retries (avoids hammering server)


# =============================================================================
# LOGGING SETUP
# =============================================================================

def setup_logging() -> logging.Logger:
    """
    Configure a logger that writes to both the terminal and a log file.
    The log file is timestamped so each run produces its own record.
    """
    logger = logging.getLogger("ecg_downloader")
    logger.setLevel(logging.DEBUG)

    # ── Terminal handler: INFO and above, human-readable format ──────────────
    console_handler = logging.StreamHandler(stream=sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(
        logging.Formatter("%(levelname)-8s %(message)s")
    )

    # ── File handler: DEBUG and above, timestamped ────────────────────────────
    log_dir = Path(__file__).parent.parent / "docs"
    log_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = log_dir / f"download_{timestamp}.log"

    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s | %(levelname)-8s | %(message)s")
    )

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger


# =============================================================================
# DOWNLOAD UTILITIES
# =============================================================================

def get_remote_file_size(url: str, logger: logging.Logger) -> int:
    """
    Perform a HEAD request to get the Content-Length of a remote file.
    Returns 0 if the server does not provide this header.
    This lets us detect incomplete/partial downloads without downloading the file.
    """
    try:
        response = requests.head(url, timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
        return int(response.headers.get("Content-Length", 0))
    except requests.RequestException as e:
        logger.debug(f"Could not fetch Content-Length for {url}: {e}")
        return 0


def is_file_complete(local_path: Path, url: str, logger: logging.Logger) -> bool:
    """
    Determine whether a local file is already fully downloaded.

    Strategy:
      1. If the file does not exist → not complete → must download.
      2. If the file exists but is 0 bytes → corrupted → re-download.
      3. If we can get remote file size → compare sizes.
         If sizes match → complete → skip.
         If sizes differ → partial download → re-download.
      4. If we cannot get remote size → assume complete if file exists and > 0.
         This is the offline-safe fallback.
    """
    if not local_path.exists():
        return False

    local_size = local_path.stat().st_size
    if local_size == 0:
        logger.warning(f"  Found zero-byte file: {local_path.name} — will re-download")
        return False

    remote_size = get_remote_file_size(url, logger)

    if remote_size > 0:
        if local_size == remote_size:
            return True  # Perfect match
        else:
            logger.warning(
                f"  Partial file detected: {local_path.name} "
                f"({local_size:,} / {remote_size:,} bytes) — will re-download"
            )
            return False

    # Cannot verify size — assume complete if file is non-empty
    logger.debug(f"  Cannot verify size for {local_path.name} — assuming complete")
    return True


def download_file(url: str, destination: Path, logger: logging.Logger) -> bool:
    """
    Download a single file from `url` to `destination` with:
      - Streaming (memory-efficient for large .dat files)
      - tqdm progress bar showing download speed and size
      - Automatic retry on failure (up to MAX_RETRIES attempts)
      - Atomic write via temp file to prevent corrupted partial files

    Returns True on success, False on permanent failure.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.debug(f"  Attempt {attempt}/{MAX_RETRIES}: GET {url}")

            response = requests.get(url, stream=True, timeout=TIMEOUT_SECONDS)
            response.raise_for_status()

            total_size = int(response.headers.get("Content-Length", 0))
            file_name = destination.name

            # Write to a temp file first — if download fails midway,
            # we don't corrupt the destination file.
            temp_path = destination.with_suffix(destination.suffix + ".tmp")

            with open(temp_path, "wb") as f:
                with tqdm(
                    total=total_size,
                    unit="B",
                    unit_scale=True,
                    unit_divisor=1024,
                    desc=f"    {file_name:<20}",
                    leave=False,
                    ncols=80,
                ) as progress_bar:
                    for chunk in response.iter_content(chunk_size=CHUNK_SIZE_BYTES):
                        if chunk:  # Filter out keep-alive empty chunks
                            f.write(chunk)
                            progress_bar.update(len(chunk))

            # Atomic rename: only replaces destination if download succeeded
            temp_path.replace(destination)
            logger.debug(f"  Saved: {destination}")
            return True

        except requests.HTTPError as e:
            # 404 = record doesn't exist on PhysioNet (configuration error)
            if e.response.status_code == 404:
                logger.error(f"  HTTP 404 — File not found on PhysioNet: {url}")
                logger.error("  Check REQUIRED_RECORDS configuration.")
                return False  # Don't retry 404s
            logger.warning(f"  HTTP error on attempt {attempt}: {e}")

        except requests.ConnectionError:
            logger.warning(f"  Connection error on attempt {attempt}. Is PhysioNet reachable?")

        except requests.Timeout:
            logger.warning(f"  Timeout on attempt {attempt} ({TIMEOUT_SECONDS}s exceeded)")

        except OSError as e:
            logger.error(f"  Filesystem error writing {destination}: {e}")
            return False

        # Wait before retrying (except after the last attempt)
        if attempt < MAX_RETRIES:
            logger.info(f"  Retrying in {RETRY_DELAY_SECONDS}s...")
            time.sleep(RETRY_DELAY_SECONDS)

    logger.error(f"  FAILED after {MAX_RETRIES} attempts: {destination.name}")
    return False


# =============================================================================
# MAIN DOWNLOAD ORCHESTRATION
# =============================================================================

def check_internet_connectivity(logger: logging.Logger) -> bool:
    """
    Quick connectivity check before starting downloads.
    Avoids cryptic timeout errors if the user is offline.

    NOTE: We use a lightweight GET to a known small file rather than HEAD,
    because PhysioNet and some CDNs reject HEAD requests with 405 errors.
    We stream it and close immediately — no data is read.
    """
    # We probe a tiny known file (the RECORDS index) instead of the homepage.
    # This is more reliable than HEAD and avoids CDN/WAF blocks.
    test_url = f"{PHYSIONET_BASE_URL}/RECORDS"
    logger.info("Checking PhysioNet connectivity...")
    try:
        response = requests.get(test_url, stream=True, timeout=15)
        response.raise_for_status()
        response.close()  # Don't actually download content
        logger.info("PhysioNet is reachable. Starting download.\n")
        return True
    except requests.HTTPError as e:
        logger.warning(f"PhysioNet returned HTTP {e.response.status_code}. Checking local files only...")
        return False
    except requests.RequestException as e:
        logger.warning(f"Cannot reach PhysioNet ({e}). Checking local files only...")
        return False


def download_record(
    record_id: str,
    description: str,
    dataset_dir: Path,
    online: bool,
    logger: logging.Logger,
) -> Tuple[int, int]:
    """
    Download all required files for a single MIT-BIH record.

    Returns:
        (downloaded_count, skipped_count) for this record.
    """
    downloaded = 0
    skipped = 0

    logger.info(f"Record {record_id}  —  {description}")

    for ext in RECORD_EXTENSIONS:
        filename = f"{record_id}{ext}"
        local_path = dataset_dir / filename
        url = f"{PHYSIONET_BASE_URL}/{filename}"

        if is_file_complete(local_path, url, logger):
            size_kb = local_path.stat().st_size / 1024
            logger.info(f"  ✓  {filename:<25} already exists ({size_kb:,.1f} KB) — skipped")
            skipped += 1
            continue

        if not online:
            logger.warning(f"  [MISSING]  {filename} — not found locally and offline, cannot download")
            continue

        logger.info(f"  ↓  Downloading {filename}...")
        success = download_file(url, local_path, logger)

        if success:
            size_kb = local_path.stat().st_size / 1024
            logger.info(f"  ✓  {filename:<25} downloaded ({size_kb:,.1f} KB)")
            downloaded += 1
        else:
            logger.error(f"  ✗  {filename} — download failed")

    print()  # Blank line between records for readability
    return downloaded, skipped


def print_summary(
    results: List[Tuple[str, int, int]],
    dataset_dir: Path,
    logger: logging.Logger,
) -> None:
    """
    Print a structured summary table of the download session.
    Shows per-record status and total file counts.
    """
    logger.info("=" * 60)
    logger.info("DOWNLOAD SUMMARY")
    logger.info("=" * 60)

    total_downloaded = 0
    total_skipped = 0

    for record_id, downloaded, skipped in results:
        total = downloaded + skipped
        status = "[OK] Complete" if total == len(RECORD_EXTENSIONS) else "[!!] Incomplete"
        logger.info(
            f"  Record {record_id}: {status}  "
            f"(downloaded={downloaded}, skipped={skipped})"
        )
        total_downloaded += downloaded
        total_skipped += skipped

    logger.info("-" * 60)
    logger.info(f"  Total files downloaded : {total_downloaded}")
    logger.info(f"  Total files skipped    : {total_skipped}")
    logger.info(f"  Dataset location       : {dataset_dir.resolve()}")
    logger.info("=" * 60)

    # Final status message
    total_expected = len(REQUIRED_RECORDS) * len(RECORD_EXTENSIONS)
    total_present = total_downloaded + total_skipped

    if total_present == total_expected:
        logger.info("\n[SUCCESS] All required files are present. You can now run the ECG converter.")
    else:
        missing = total_expected - total_present
        logger.warning(f"\n[WARNING] {missing} file(s) are missing. Re-run this script when online.")


def main() -> None:
    """
    Entry point for the dataset downloader.

    Orchestration flow:
      1. Setup logging
      2. Create dataset directory
      3. Check internet connectivity
      4. For each required record, download missing files
      5. Print summary report
    """
    logger = setup_logging()

    logger.info("=" * 60)
    logger.info("Healthcare Simulation Monitor — Dataset Downloader")
    logger.info("MIT-BIH Arrhythmia Database  |  PhysioNet v1.0.0")
    logger.info("=" * 60)
    logger.info(f"Records to process   : {len(REQUIRED_RECORDS)}")
    logger.info(f"Files per record     : {len(RECORD_EXTENSIONS)}")
    logger.info(f"Total files expected : {len(REQUIRED_RECORDS) * len(RECORD_EXTENSIONS)}")
    logger.info(f"Destination          : {DATASET_DIR.resolve()}")
    logger.info("")

    # ── Step 1: Ensure destination directory exists ───────────────────────────
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    logger.debug(f"Dataset directory ready: {DATASET_DIR}")

    # ── Step 2: Internet connectivity check ───────────────────────────────────
    online = check_internet_connectivity(logger)

    # ── Step 3: Download each record ─────────────────────────────────────────
    results: List[Tuple[str, int, int]] = []

    for record_id, description in REQUIRED_RECORDS.items():
        downloaded, skipped = download_record(
            record_id=record_id,
            description=description,
            dataset_dir=DATASET_DIR,
            online=online,
            logger=logger,
        )
        results.append((record_id, downloaded, skipped))

    # ── Step 4: Summary ───────────────────────────────────────────────────────
    print_summary(results, DATASET_DIR, logger)


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    main()
