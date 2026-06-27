"""
converter/extract_12lead.py
===========================
Extracts a clean 10-second 12-lead ECG snapshot from a PTB record.

Leads extracted (standard 12):  I, II, III, aVR, aVL, aVF, V1–V6
Frank leads (Vx, Vy, Vz) are ignored for the 12-lead printout.

Output is a dict with:
  {
    "leads": {
      "I":   [float, ...],  # signal[-1.0..+1.0]
      "II":  [float, ...],
      ...
      "V6":  [float, ...],
    },
    "fs":         int,     # sampling frequency (Hz)
    "duration_s": float,   # duration in seconds
  }
"""

from pathlib import Path
import numpy as np
import wfdb

# The 12 standard leads in display order
TWELVE_LEAD_NAMES = ["i", "ii", "iii", "avr", "avl", "avf", "v1", "v2", "v3", "v4", "v5", "v6"]

# Display labels (proper capitalization for UI)
LEAD_LABELS = {
    "i": "I", "ii": "II", "iii": "III",
    "avr": "aVR", "avl": "aVL", "avf": "aVF",
    "v1": "V1", "v2": "V2", "v3": "V3",
    "v4": "V4", "v5": "V5", "v6": "V6",
}

# Duration of ECG to export (seconds) — 10 seconds is standard for a 12-lead printout
EXPORT_DURATION_S = 10


def extract_12lead(record_path: str) -> dict:
    """
    Load a PTB .hea/.dat record and return normalized 12-lead signals.

    Parameters
    ----------
    record_path : str
        Path to the record WITHOUT extension, e.g.
        'd:/ecg/HealthcareSimulationMonitor/datasets/ptb/s0010_re'

    Returns
    -------
    dict  with keys: 'leads', 'fs', 'duration_s', 'record', 'num_samples'
    """
    record = wfdb.rdrecord(record_path)
    fs     = record.fs
    sigs   = record.sig_name      # list of signal names (lowercase)
    p_sig  = record.p_signal      # np.ndarray shape (n_samples, n_leads)

    # How many samples to export?
    n_export = min(int(fs * EXPORT_DURATION_S), p_sig.shape[0])

    leads = {}
    for lead_name in TWELVE_LEAD_NAMES:
        # Find the column index for this lead (case-insensitive)
        matches = [i for i, s in enumerate(sigs) if s.lower() == lead_name]
        if not matches:
            raise ValueError(
                f"Lead '{lead_name}' not found in record. "
                f"Available signals: {sigs}"
            )
        col = matches[0]
        raw = p_sig[:n_export, col].astype(float)

        # Replace any NaN (missing samples) with 0
        raw = np.where(np.isnan(raw), 0.0, raw)

        # Normalize to [-1, +1] using 99th percentile to be robust to spikes
        p99 = np.percentile(np.abs(raw), 99)
        if p99 > 0:
            normalized = np.clip(raw / p99, -1.0, 1.0)
        else:
            normalized = raw

        leads[LEAD_LABELS[lead_name]] = [round(float(v), 4) for v in normalized]

    return {
        "record":      Path(record_path).name,
        "fs":          fs,
        "duration_s":  n_export / fs,
        "num_samples": n_export,
        "leads":       leads,
    }
