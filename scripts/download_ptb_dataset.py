import wfdb
import os
from pathlib import Path
import json

# Define the records we want to download to represent different generalized conditions.
# Format: "condition_id": {"patient": "patient_folder", "record": "record_name"}
PTB_RECORDS = {
    "NORMAL":       {"patient": "patient104", "record": "s0306lre", "label": "Normal Sinus Rhythm (Healthy)"},
    "ANTERIOR_MI":  {"patient": "patient001", "record": "s0010_re", "label": "Anterior Myocardial Infarction"},
    "INFERIOR_MI":  {"patient": "patient021", "record": "s0073lre", "label": "Inferior Myocardial Infarction"},
    "HYPERTROPHY":  {"patient": "patient067", "record": "s0213lre", "label": "Myocardial Hypertrophy"},
    "DYSRHYTHMIA":  {"patient": "patient152", "record": "s0291lre", "label": "Dysrhythmia (Atrial Fibrillation)"}
}

def download_ptb_dataset():
    dataset_dir = Path('d:/ecg/HealthcareSimulationMonitor/datasets/ptb')
    dataset_dir.mkdir(parents=True, exist_ok=True)
    
    print("Downloading PTB generalized conditions dataset...")
    
    for condition, info in PTB_RECORDS.items():
        patient = info["patient"]
        record_name = info["record"]
        pn_dir = f"ptbdb/1.0.0/{patient}"
        
        print(f"[{condition}] Fetching {patient}/{record_name} from PhysioNet...")
        try:
            record = wfdb.rdrecord(record_name, pn_dir=pn_dir)
            
            # Save the record locally with the condition name
            wfdb.wrsamp(record_name=condition.lower(),
                        fs=record.fs,
                        units=record.units,
                        sig_name=record.sig_name,
                        p_signal=record.p_signal,
                        fmt=record.fmt,
                        write_dir=str(dataset_dir))
            print(f"  -> Saved as {condition.lower()}.dat")
        except Exception as e:
            print(f"  -> Failed to download {condition}: {e}")

if __name__ == '__main__':
    download_ptb_dataset()
