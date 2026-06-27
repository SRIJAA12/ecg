"""
scripts/fetch_wfdb.py
=====================
Uses wfdb's built-in PhysioNet download instead of manual HTTP requests.
wfdb handles chunking, retries and CDN routing natively — much faster
than our requests-based downloader for large .dat files.

Usage:
    python scripts/fetch_wfdb.py
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from pathlib import Path
import wfdb

DATASET_DIR = Path(__file__).parent.parent / "datasets" / "mit-bih"
DATASET_DIR.mkdir(parents=True, exist_ok=True)

# The 5 records we need for Phase 1
RECORDS = ["100", "119", "202", "207", "208"]

print("=" * 55)
print("Healthcare Simulation Monitor — wfdb Dataset Fetch")
print("=" * 55)
print(f"Destination: {DATASET_DIR.resolve()}\n")

for record_id in RECORDS:
    # Check if all 3 files already exist and are complete
    needed = [f"{record_id}.hea", f"{record_id}.dat", f"{record_id}.atr"]
    missing = [f for f in needed if not (DATASET_DIR / f).exists()
               or (DATASET_DIR / f).stat().st_size == 0]

    if not missing:
        print(f"  [SKIP]  Record {record_id} — all files present")
        continue

    print(f"  [DOWN]  Record {record_id} — downloading: {missing}")
    try:
        # wfdb.dl_pdb downloads the record files into the specified directory
        wfdb.dl_database(
            "mitdb",
            str(DATASET_DIR),
            records=[record_id],
            annotators=["atr"],
        )
        print(f"  [OK]    Record {record_id} — done")
    except Exception as e:
        print(f"  [FAIL]  Record {record_id} — {e}")

print("\nDone. Now run: python converter/convert.py")
