"""
converter/convert_12lead.py
============================
Standalone script to convert the PTB sample record into a 12-lead JSON
file consumed by the frontend TwelveLeadView component.

Usage:
    python -m converter.convert_12lead

Output:
    frontend/public/waveforms/ecg/12lead.json
"""

import json
from pathlib import Path
from .extract_12lead import extract_12lead

DATASETS_DIR = Path("datasets/ptb")
OUTPUT_DIR   = Path("frontend/public/waveforms/ptb")

# All conditions matching the full Laerdal interface
CONDITIONS = [
    "normal", "ischemia", "post_ischemia",
    "inferior_ami", "anterior_ami", "lateral_ami",
    "lbbb", "rbbb",
    "lv_hypertrophy", "rv_hypertrophy",
    "cardiomyopathy", "dysrhythmia", "av_block",
    "valvular", "myocarditis",
]

def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    for cond in CONDITIONS:
        record_path = DATASETS_DIR / cond
        out_path = OUTPUT_DIR / f"{cond}.json"
        
        print(f"[12-lead] Extracting {cond} ...")
        
        if not record_path.with_suffix(".dat").exists():
            print(f"  -> SKIP: {record_path}.dat not found.")
            continue
            
        data = extract_12lead(str(record_path))
        
        with open(out_path, "w") as f:
            json.dump(data, f, separators=(",", ":"))
            
        print(f"  -> [OK] Wrote {out_path}")

if __name__ == "__main__":
    main()
