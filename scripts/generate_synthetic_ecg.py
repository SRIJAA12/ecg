"""
scripts/generate_synthetic_ecg.py
=================================
Generates synthetic ECG waveforms for the 5 supported rhythms.
This is used as a fallback to unblock frontend development when 
PhysioNet servers are throttling or unavailable.

The synthetic data uses a basic mathematical model (P-QRS-T) to 
approximate the waveforms so the React UI can be tested.

Usage:
    python scripts/generate_synthetic_ecg.py
"""

import json
import math
import datetime
from pathlib import Path

# Paths
FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "public" / "waveforms" / "ecg"
FRONTEND_DIR.mkdir(parents=True, exist_ok=True)

# Shared parameters
SAMPLE_RATE = 360  # Match MIT-BIH
DURATION_SEC = 6   # 6 seconds of data
NUM_SAMPLES = SAMPLE_RATE * DURATION_SEC

def _generate_pqrst(t_offset, hr_bpm, rhythm_type="sinus"):
    """Generates a single P-QRS-T complex centered at t_offset."""
    signal = [0.0] * NUM_SAMPLES
    
    # Simple Gaussian function
    def gauss(x, a, b, c):
        return a * math.exp(-((x - b)**2) / (2 * c**2))
    
    for i in range(NUM_SAMPLES):
        t = i / SAMPLE_RATE
        # Time relative to the R-peak of this beat
        dt = t - t_offset
        
        # Base components for normal sinus
        # P wave
        p_wave = gauss(dt, 0.15, -0.15, 0.03)
        # QRS complex (Q, R, S)
        q_wave = gauss(dt, -0.15, -0.04, 0.015)
        r_wave = gauss(dt, 1.0, 0.0, 0.015)
        s_wave = gauss(dt, -0.25, 0.04, 0.015)
        # T wave
        t_wave = gauss(dt, 0.25, 0.2, 0.06)
        
        if rhythm_type == "sinus":
            val = p_wave + q_wave + r_wave + s_wave + t_wave
        elif rhythm_type == "pvc":
            # Wide, bizarre QRS, no P wave, inverted T wave
            r_wave_pvc = gauss(dt, 0.8, 0.0, 0.04)
            s_wave_pvc = gauss(dt, -0.8, 0.08, 0.04)
            t_wave_pvc = gauss(dt, -0.3, 0.3, 0.08)
            val = r_wave_pvc + s_wave_pvc + t_wave_pvc
        elif rhythm_type == "afib":
            # No visible P waves, fibrillatory baseline (added later), narrow QRS
            val = q_wave + r_wave + s_wave + t_wave
        elif rhythm_type == "vt":
            # Fast, wide QRS complexes
            r_wave_vt = gauss(dt, 0.8, 0.0, 0.05)
            s_wave_vt = gauss(dt, -0.6, 0.08, 0.05)
            val = r_wave_vt + s_wave_vt
        elif rhythm_type == "vf":
            # Handled separately (continuous chaotic waves)
            val = 0
            
        signal[i] = val
        
    return signal

def generate_rhythm(rhythm, hr_bpm):
    signal = [0.0] * NUM_SAMPLES
    beat_duration_ms = 60000 / hr_bpm
    beat_duration_sec = beat_duration_ms / 1000
    
    if rhythm == "vf":
        # Ventricular Fibrillation: chaotic, irregular baseline, no clear QRS
        # Sum of several sine waves with different frequencies and phases
        for i in range(NUM_SAMPLES):
            t = i / SAMPLE_RATE
            val = 0.5 * math.sin(2 * math.pi * 3.5 * t) + \
                  0.3 * math.sin(2 * math.pi * 5.2 * t + 1.2) + \
                  0.2 * math.sin(2 * math.pi * 2.1 * t + 0.5)
            signal[i] = val
    else:
        # Generate beats
        t_current = 0.5 # Start first beat at 0.5s
        
        while t_current < DURATION_SEC:
            # Determine if this specific beat is normal or abnormal
            current_beat_type = rhythm
            if rhythm == "pvc":
                # Mix of sinus and PVC (every 3rd beat is PVC)
                beat_idx = int(t_current / beat_duration_sec)
                current_beat_type = "pvc" if beat_idx % 3 == 0 else "sinus"
            
            beat_signal = _generate_pqrst(t_current, hr_bpm, current_beat_type)
            
            for i in range(NUM_SAMPLES):
                signal[i] += beat_signal[i]
                
            # Advance to next beat
            if rhythm == "afib":
                # Irregular RR intervals
                import random
                t_current += beat_duration_sec + random.uniform(-0.2, 0.2)
            else:
                t_current += beat_duration_sec
                
        # Add baseline wander / noise
        if rhythm == "afib":
            # Fibrillatory baseline
            for i in range(NUM_SAMPLES):
                t = i / SAMPLE_RATE
                signal[i] += 0.05 * math.sin(2 * math.pi * 6 * t) + 0.02 * math.sin(2 * math.pi * 12 * t)

    # Normalize to [-1.0, 1.0]
    min_val = min(signal)
    max_val = max(signal)
    range_val = max_val - min_val if max_val > min_val else 1.0
    
    normalized_signal = []
    for val in signal:
        # Scale to [-1, 1]
        norm = 2.0 * ((val - min_val) / range_val) - 1.0
        # Clip just in case
        norm = max(-1.0, min(1.0, norm))
        # Reduce precision for smaller JSON
        normalized_signal.append(round(norm, 4))
        
    return {
        "rhythm": rhythm,
        "record": f"synthetic-{rhythm}",
        "description": f"Synthetic {rhythm.upper()} Waveform",
        "sample_rate": SAMPLE_RATE,
        "num_samples": NUM_SAMPLES,
        "duration_ms": DURATION_SEC * 1000,
        "beat_duration_ms": round(beat_duration_ms, 1),
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "source": "Synthetic Generator",
        "raw_min_mv": round(min_val, 3),
        "raw_max_mv": round(max_val, 3),
        "signal": normalized_signal
    }

def main():
    rhythms = {
        "sinus": 72,
        "pvc": 72,
        "afib": 85,
        "vt": 160,
        "vf": 0 # VF has no definable HR, but we still generate the file
    }
    
    for rhythm, hr in rhythms.items():
        print(f"Generating synthetic {rhythm}...")
        data = generate_rhythm(rhythm, hr if hr > 0 else 72)
        
        output_file = FRONTEND_DIR / f"{rhythm}.json"
        with open(output_file, "w") as f:
            json.dump(data, f)
            
        print(f"  Saved to {output_file}")
        
    print("Done! The frontend should now render the synthetic waveforms.")

if __name__ == "__main__":
    main()
