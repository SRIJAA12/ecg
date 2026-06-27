"""
scripts/download_ptb_full.py
============================
Downloads specific PTB records for every condition in the Laerdal
"Edit running rhythm" interface.

Step 1: Scans ALL 549 PTB record headers to find diagnoses.
Step 2: Maps each Laerdal condition to the best available patient.
Step 3: Downloads and saves the matched records.

Run: python scripts/download_ptb_full.py
"""
import wfdb
import json
import re
from pathlib import Path

DATASET_DIR = Path("datasets/ptb")
INDEX_FILE  = Path("datasets/ptb/index.json")
DATASET_DIR.mkdir(parents=True, exist_ok=True)

# ─── Laerdal condition → search keywords in PTB header comments ───────────────
# Each entry: (output_filename, [list of keyword sets - first match wins])
CONDITION_MAP = [
    # Already downloaded but will be re-checked
    ("normal",               ["healthy", "control"]),
    ("ischemia",             ["ischemia"]),
    ("post_ischemia",        ["post ischemia", "former infarction"]),
    ("inferior_ami",         ["infero", "inferior wall"]),
    ("anterior_ami",         ["antero", "anterior wall", "RIVA"]),
    ("lateral_ami",          ["lateral", "latero"]),
    ("lbbb",                 ["left bundle branch block", "lbbb"]),
    ("rbbb",                 ["right bundle branch block", "rbbb"]),
    ("lv_hypertrophy",       ["left ventricular hypertrophy", "lv hypertrophy", "hypertrophy"]),
    ("rv_hypertrophy",       ["right ventricular hypertrophy", "rv hypertrophy"]),
    ("cardiomyopathy",       ["cardiomyopathy", "dilated", "heart failure"]),
    ("dysrhythmia",          ["dysrhythmia", "arrhythmia", "atrial fibrillation"]),
    ("av_block",             ["av block", "atrioventricular block", "heart block"]),
    ("valvular",             ["valvular", "valve disease", "mitral", "aortic stenosis"]),
    ("myocarditis",          ["myocarditis"]),
]

def get_comment_text(record_name: str, patient_folder: str) -> str:
    """Fetch header comments as a single lowercase string."""
    try:
        r = wfdb.rdheader(record_name, pn_dir=f"ptbdb/1.0.0/{patient_folder}")
        return " ".join(r.comments).lower()
    except Exception:
        return ""

def scan_all_records() -> list:
    """Download the full record list and extract diagnoses from headers."""
    print("Fetching full PTB record list (549 records)...")
    all_recs = wfdb.get_record_list("ptbdb/1.0.0")
    print(f"Found {len(all_recs)} records. Scanning headers...")

    scanned = []
    for i, full_path in enumerate(all_recs):
        parts = full_path.split("/")
        if len(parts) != 2:
            continue
        patient, record = parts
        text = get_comment_text(record, patient)
        scanned.append({"patient": patient, "record": record, "text": text})
        if (i + 1) % 50 == 0:
            print(f"  Scanned {i+1}/{len(all_recs)} records...")

    print(f"Scan complete. Saving index...")
    with open(INDEX_FILE, "w") as f:
        json.dump(scanned, f, indent=2)
    return scanned

def match_conditions(scanned: list) -> dict:
    """Map each condition to the best available patient record."""
    results = {}
    for (filename, keywords) in CONDITION_MAP:
        for entry in scanned:
            text = entry["text"]
            if any(kw in text for kw in keywords):
                results[filename] = entry
                break
        if filename not in results:
            print(f"  [WARN] No match found for: {filename}")
    return results

def download_record(patient: str, record: str, out_name: str):
    """Download a single PTB record and save it with the condition name."""
    print(f"[{out_name}] Downloading {patient}/{record}...")
    try:
        rec = wfdb.rdrecord(record, pn_dir=f"ptbdb/1.0.0/{patient}")
        wfdb.wrsamp(
            record_name=out_name,
            fs=rec.fs,
            units=rec.units,
            sig_name=rec.sig_name,
            p_signal=rec.p_signal,
            fmt=rec.fmt,
            write_dir=str(DATASET_DIR),
        )
        print(f"  -> Saved as {out_name}.dat")
        return True
    except Exception as e:
        print(f"  -> FAILED: {e}")
        return False

def main():
    # Step 1: Scan (or load cached scan)
    if INDEX_FILE.exists():
        print(f"Loading cached index from {INDEX_FILE}...")
        with open(INDEX_FILE) as f:
            scanned = json.load(f)
        print(f"Loaded {len(scanned)} cached records.")
    else:
        scanned = scan_all_records()

    # Step 2: Match conditions
    print("\nMatching conditions to PTB patients...")
    matches = match_conditions(scanned)

    print(f"\nFound matches for {len(matches)}/{len(CONDITION_MAP)} conditions:")
    for name, entry in matches.items():
        print(f"  {name:25s} -> {entry['patient']}/{entry['record']}")

    # Step 3: Download matched records
    print("\nDownloading records...")
    results = {}
    for out_name, entry in matches.items():
        # Skip if already downloaded
        dat_path = DATASET_DIR / f"{out_name}.dat"
        if dat_path.exists():
            print(f"  [{out_name}] Already exists, skipping.")
            results[out_name] = True
            continue
        ok = download_record(entry["patient"], entry["record"], out_name)
        results[out_name] = ok

    print("\n=== Download Summary ===")
    for name, ok in results.items():
        status = "OK" if ok else "FAILED"
        print(f"  [{status:6s}] {name}")

if __name__ == "__main__":
    main()
