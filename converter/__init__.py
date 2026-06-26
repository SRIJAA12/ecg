"""
converter/
==========
ECG Signal Processing Pipeline for the Healthcare Simulation Monitor.

Modules:
    utils     — Load MIT-BIH records and annotations via wfdb
    extract   — Extract representative waveform segments per rhythm
    normalize — Normalize signal amplitude to [-1.0, +1.0]
    export    — Serialize to JSON and write to output directories
    convert   — Main pipeline: orchestrates all modules above

Usage:
    python converter/convert.py
"""
