import wfdb
import os
from pathlib import Path

def download_ptb_sample():
    dataset_dir = Path('d:/ecg/HealthcareSimulationMonitor/datasets/ptb')
    dataset_dir.mkdir(parents=True, exist_ok=True)
    
    print("Downloading PTB record patient001/s0010_re...")
    # wfdb.dl_database allows downloading specific files or folders.
    # It's easier to download a single record by fetching its header and dat file.
    
    # Download the record using dl_pb_database or similar, or just rdrecord with pn_dir
    print("Fetching record from PhysioNet...")
    record = wfdb.rdrecord('s0010_re', pn_dir='ptbdb/1.0.0/patient001')
    
    print("Saving record locally...")
    wfdb.wrsamp(record_name='s0010_re',
                fs=record.fs,
                units=record.units,
                sig_name=record.sig_name,
                p_signal=record.p_signal,
                fmt=record.fmt,
                write_dir=str(dataset_dir))
    
    print(f"Downloaded PTB sample to {dataset_dir}")
    print(f"Signals found: {record.sig_name}")

if __name__ == '__main__':
    download_ptb_sample()
