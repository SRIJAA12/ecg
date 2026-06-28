/**
 * src/utils/ecgGenerator.ts
 * =========================
 * Real-time mathematical ECG generator using Gaussian-based PQRST model.
 * Generates ECG waveforms dynamically without pre-recorded datasets.
 */

import type { ECGRhythm, TransferMode } from "@/types/ecg";

// =============================================================================
// GAUSSIAN WAVE PARAMETERS
// =============================================================================

interface GaussianParams {
  amplitude: number;
  center: number;
  width: number;
}

interface PQRSTParams {
  p: GaussianParams;
  q: GaussianParams;
  r: GaussianParams;
  s: GaussianParams;
  t: GaussianParams;
}

// Base PQRST parameters for normal sinus rhythm (timing in seconds relative to beat start)
const BASE_PQRST: PQRSTParams = {
  p: { amplitude: 0.15, center: 0.08, width: 0.06 },
  q: { amplitude: -0.15, center: 0.14, width: 0.03 },
  r: { amplitude: 1.0, center: 0.16, width: 0.03 },
  s: { amplitude: -0.25, center: 0.18, width: 0.03 },
  t: { amplitude: 0.25, center: 0.28, width: 0.10 },
};

// =============================================================================
// RHYTHM-SPECIFIC PARAMETERS
// =============================================================================

function getPQRSTParamsForRhythm(rhythm: ECGRhythm): PQRSTParams {
  const base = { ...BASE_PQRST };

  switch (rhythm) {
    case "normal_sinus":
      return base;

    case "sinus_bradycardia":
      // Same morphology, just slower HR (handled by RR interval)
      return base;

    case "sinus_tachycardia":
      // Same morphology, just faster HR (handled by RR interval)
      return base;

    case "atrial_fibrillation":
      // No P waves, irregular RR (handled in generator)
      return {
        ...base,
        p: { amplitude: 0, center: 0.1, width: 0.08 },
      };

    case "pvc":
      // Wide QRS for PVC beats (handled in generator)
      return base;

    case "ventricular_tachycardia":
      // Wide QRS, no P waves
      return {
        p: { amplitude: 0, center: 0.1, width: 0.08 },
        q: { amplitude: -0.1, center: 0.15, width: 0.06 },
        r: { amplitude: 0.8, center: 0.2, width: 0.08 },
        s: { amplitude: -0.3, center: 0.28, width: 0.08 },
        t: { amplitude: 0.2, center: 0.45, width: 0.15 },
      };

    case "ventricular_fibrillation":
      // Chaotic - handled in generator
      return base;

    case "asystole":
      // Flat line - handled in generator
      return base;

    case "pea":
      // Normal ECG appearance
      return base;

    case "lbbb":
      // Wide QRS, broad R wave
      return {
        ...base,
        q: { amplitude: -0.05, center: 0.18, width: 0.04 },
        r: { amplitude: 0.9, center: 0.22, width: 0.08 },
        s: { amplitude: -0.15, center: 0.3, width: 0.06 },
      };

    case "rbbb":
      // Wide QRS, delayed right ventricular activation
      return {
        ...base,
        r: { amplitude: 0.9, center: 0.2, width: 0.06 },
        s: { amplitude: -0.35, center: 0.26, width: 0.06 },
      };

    case "stemi":
      // Elevated ST segment
      return {
        ...base,
        t: { amplitude: 0.35, center: 0.38, width: 0.12 },
      };

    default:
      return base;
  }
}

// =============================================================================
// GAUSSIAN FUNCTION
// =============================================================================

function gaussian(t: number, params: GaussianParams): number {
  const { amplitude, center, width } = params;
  return amplitude * Math.exp(-Math.pow((t - center) / width, 2));
}

// =============================================================================
// ECG GENERATOR CLASS
// =============================================================================

export class ECGGenerator {
  private rhythm: ECGRhythm;
  private heartRate: number;
  private transferMode: TransferMode;
  private transferTime: number;
  
  private targetRhythm: ECGRhythm;
  private targetHeartRate: number;
  private transitionStartTime: number | null = null;
  private previousRhythm: ECGRhythm | null = null;
  private previousHeartRate: number | null = null;
  
  constructor() {
    this.rhythm = "normal_sinus";
    this.heartRate = 80;
    this.transferMode = "immediate";
    this.transferTime = 2;
    this.targetRhythm = "normal_sinus";
    this.targetHeartRate = 80;
  }

  setRhythm(rhythm: ECGRhythm): void {
    this.previousRhythm = this.rhythm;
    this.targetRhythm = rhythm;
    this.transitionStartTime = performance.now();
    
    if (this.transferMode === "immediate") {
      this.rhythm = rhythm;
      this.transitionStartTime = null;
    }
  }

  setHeartRate(hr: number): void {
    this.previousHeartRate = this.heartRate;
    this.targetHeartRate = hr;
    this.transitionStartTime = performance.now();
    
    if (this.transferMode === "immediate") {
      this.heartRate = hr;
      this.transitionStartTime = null;
    }
  }

  setTransferMode(mode: TransferMode): void {
    this.transferMode = mode;
  }

  setTransferTime(seconds: number): void {
    this.transferTime = seconds;
  }

  private getRRInterval(): number {
    // RR Interval = 60 / HR (in seconds)
    if (this.heartRate <= 0) return Infinity;
    
    let rr = 60 / this.heartRate;
    
    // Add irregularity for atrial fibrillation
    if (this.rhythm === "atrial_fibrillation") {
      const variation = (Math.random() - 0.5) * 0.3 * rr;
      rr += variation;
    }
    
    return Math.max(rr, 0.1);
  }

  private interpolateValue(
    current: number,
    target: number,
    elapsed: number,
    duration: number
  ): number {
    if (duration <= 0 || elapsed >= duration) return target;
    
    const progress = elapsed / duration;
    
    switch (this.transferMode) {
      case "linear":
        return current + (target - current) * progress;
      
      case "exponential":
        // Faster at beginning, slower near end
        const expProgress = 1 - Math.exp(-3 * progress);
        return current + (target - current) * expProgress;
      
      case "immediate":
      default:
        return target;
    }
  }

  private updateTransition(currentTime: number): void {
    if (this.transitionStartTime === null) return;
    
    const elapsed = (currentTime - this.transitionStartTime) / 1000;
    
    if (elapsed >= this.transferTime) {
      // Transition complete
      this.rhythm = this.targetRhythm;
      this.heartRate = this.targetHeartRate;
      this.transitionStartTime = null;
      return;
    }
    
    // Interpolate heart rate
    if (this.previousHeartRate !== null) {
      this.heartRate = this.interpolateValue(
        this.previousHeartRate,
        this.targetHeartRate,
        elapsed,
        this.transferTime
      );
    }
    
    // For rhythm, we switch at the end of transition
    // (morphology changes are applied gradually in generateSample)
  }

  private generatePQRST(t: number, params: PQRSTParams): number {
    let value = 0;
    value += gaussian(t, params.p);
    value += gaussian(t, params.q);
    value += gaussian(t, params.r);
    value += gaussian(t, params.s);
    value += gaussian(t, params.t);
    return value;
  }

  private generateVfibSample(t: number): number {
    // Chaotic oscillatory signal
    const noise1 = Math.sin(t * 50) * 0.3;
    const noise2 = Math.sin(t * 73) * 0.2;
    const noise3 = Math.sin(t * 97) * 0.15;
    const random = (Math.random() - 0.5) * 0.2;
    return noise1 + noise2 + noise3 + random;
  }

  private generateAsystoleSample(): number {
    // Near-zero amplitude with tiny noise
    return (Math.random() - 0.5) * 0.01;
  }

  generateSample(time: number): number {
    this.updateTransition(time);
    
    // Handle special rhythms
    if (this.rhythm === "ventricular_fibrillation") {
      return this.generateVfibSample(time);
    }
    
    if (this.rhythm === "asystole") {
      return this.generateAsystoleSample();
    }
    
    // Calculate beat timing
    const rr = this.getRRInterval();
    
    // Use modulo for continuous repeating pattern
    // This ensures smooth transitions even when going backwards in time
    const timeInBeat = time % rr;
    
    // For PVC, occasionally modify the beat
    let adjustedTimeInBeat = timeInBeat;
    const beatNumber = Math.floor(time / rr);
    if (this.rhythm === "pvc" && beatNumber % 5 === 0) {
      // PVC: wider QRS (handled by params), but timing is same
    }
    
    // Get PQRST parameters
    let params = getPQRSTParamsForRhythm(this.rhythm);
    
    // Handle transition blending
    if (this.transitionStartTime !== null && this.previousRhythm) {
      const elapsed = (time - this.transitionStartTime) / 1000;
      const progress = Math.min(elapsed / this.transferTime, 1);
      
      if (progress < 1) {
        const prevParams = getPQRSTParamsForRhythm(this.previousRhythm);
        params = this.interpolatePQRST(prevParams, params, progress);
      }
    }
    
    // Generate sample
    let value = this.generatePQRST(adjustedTimeInBeat, params);
    
    // Add baseline noise for realism
    value += (Math.random() - 0.5) * 0.02;
    
    return value;
  }

  private interpolatePQRST(
    from: PQRSTParams,
    to: PQRSTParams,
    progress: number
  ): PQRSTParams {
    const interp = (a: number, b: number) => a + (b - a) * progress;
    
    return {
      p: {
        amplitude: interp(from.p.amplitude, to.p.amplitude),
        center: interp(from.p.center, to.p.center),
        width: interp(from.p.width, to.p.width),
      },
      q: {
        amplitude: interp(from.q.amplitude, to.q.amplitude),
        center: interp(from.q.center, to.q.center),
        width: interp(from.q.width, to.q.width),
      },
      r: {
        amplitude: interp(from.r.amplitude, to.r.amplitude),
        center: interp(from.r.center, to.r.center),
        width: interp(from.r.width, to.r.width),
      },
      s: {
        amplitude: interp(from.s.amplitude, to.s.amplitude),
        center: interp(from.s.center, to.s.center),
        width: interp(from.s.width, to.s.width),
      },
      t: {
        amplitude: interp(from.t.amplitude, to.t.amplitude),
        center: interp(from.t.center, to.t.center),
        width: interp(from.t.width, to.t.width),
      },
    };
  }

  reset(): void {
    this.transitionStartTime = null;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let generatorInstance: ECGGenerator | null = null;

export function getECGGenerator(): ECGGenerator {
  if (!generatorInstance) {
    generatorInstance = new ECGGenerator();
  }
  return generatorInstance;
}
