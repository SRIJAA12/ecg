/**
 * src/types/ecg.ts
 * ================
 * Central TypeScript type definitions for the Healthcare Simulation Monitor.
 *
 * These types are the contract between:
 *   - The Python converter (produces JSON matching WaveformData)
 *   - The data loading service (parses JSON → WaveformData)
 *   - The Zustand store (holds MonitorState)
 *   - Every React component (reads from MonitorState)
 *
 * IMPORTANT: If you change the Python converter's JSON output schema,
 * update WaveformData here. TypeScript will immediately flag every
 * consumer that needs updating — that's the value of strict types.
 */

// =============================================================================
// RHYTHM TYPES
// =============================================================================

/**
 * The set of cardiac rhythms supported in Phase 1.
 *
 * This is a TypeScript union type (not an enum) because:
 *   - It maps directly to filename conventions: `${Rhythm}.json`
 *   - It can be widened in future phases without breaking existing code
 *   - It serializes cleanly to/from the JSON waveform files
 *
 * Phase 2 will add: 'bradycardia' | 'heart_block_2' | 'heart_block_3' | etc.
 */
export type Rhythm =
  | "sinus"   // Normal Sinus Rhythm (MIT-BIH Record 100)
  | "pvc"     // Premature Ventricular Contraction (Record 119)
  | "afib"    // Atrial Fibrillation (Record 202)
  | "vt"      // Ventricular Tachycardia (Record 207)
  | "vf";     // Ventricular Fibrillation (Record 208)

/**
 * Human-readable display names for each rhythm.
 * Used in the RhythmDropdown component.
 */
export const RHYTHM_LABELS: Record<Rhythm, string> = {
  sinus: "Normal Sinus Rhythm",
  pvc:   "PVC (Premature Ventricular)",
  afib:  "Atrial Fibrillation",
  vt:    "Ventricular Tachycardia",
  vf:    "Ventricular Fibrillation",
} as const;

/**
 * Clinical severity classification.
 * Used later to color-code the monitor UI (e.g., red alert for VF).
 */
export type RhythmSeverity = "normal" | "warning" | "critical";

export const RHYTHM_SEVERITY: Record<Rhythm, RhythmSeverity> = {
  sinus: "normal",
  pvc:   "warning",
  afib:  "warning",
  vt:    "critical",
  vf:    "critical",
} as const;

// =============================================================================
// WAVEFORM DATA (matches Python converter JSON schema exactly)
// =============================================================================

/**
 * The exact shape of the JSON files produced by converter/convert.py.
 *
 * Each field here corresponds to a field written by converter/export.py.
 * If you add a field in Python, add it here. TypeScript will enforce it.
 */
export interface WaveformData {
  /** Rhythm identifier — matches the Rhythm type above */
  rhythm: Rhythm;

  /** MIT-BIH record number that was the source of this waveform */
  record: string;

  /** Human-readable description of this waveform */
  description: string;

  /** Sampling frequency in Hz (always 360 for MIT-BIH) */
  sample_rate: number;

  /** Number of data points in the signal array */
  num_samples: number;

  /** Total duration of this waveform segment in milliseconds */
  duration_ms: number;

  /**
   * Duration of one cardiac cycle (R-to-R interval) in milliseconds.
   *
   * This is the KEY value for heart rate animation:
   *   - Default playback: 1 beat = beat_duration_ms ms
   *   - At target HR:     1 beat = (60000 / targetHR) ms
   *   - Speed multiplier: beat_duration_ms / (60000 / targetHR)
   *
   * Example: beat_duration_ms = 833ms (72 bpm)
   *   At 120 bpm: speed = 833 / 500 = 1.666x faster
   */
  beat_duration_ms: number;

  /** ISO8601 UTC timestamp when this file was generated */
  generated_at: string;

  /** Source citation */
  source: string;

  /** Raw signal minimum in mV (before normalization, for debugging) */
  raw_min_mv: number;

  /** Raw signal maximum in mV (before normalization, for debugging) */
  raw_max_mv: number;

  /**
   * The ECG signal data.
   * Array of float values normalized to the range [-1.0, +1.0].
   * Length = num_samples.
   *
   * Canvas renderer maps:
   *   -1.0 → bottom of canvas (with padding)
   *   +1.0 → top of canvas (with padding)
   *    0.0 → vertical center (isoelectric line)
   */
  signal: number[];
}

// =============================================================================
// MONITOR STATE (what the Zustand store holds)
// =============================================================================

/**
 * The complete application state managed by Zustand.
 *
 * Phase 1 contains only ECG-related state.
 * Future phases will extend this with:
 *   - bloodPressure: { systolic, diastolic }
 *   - spo2: number
 *   - respiratoryRate: number
 *   - temperature: number
 *   - etc.
 */
export interface MonitorState {
  // ── Vital parameters ───────────────────────────────────────────────────────

  /** Target heart rate in beats per minute. Range: 20–300. Default: 72. */
  heartRate: number;

  /** The currently selected cardiac rhythm */
  rhythm: Rhythm;

  /**
   * Animation playback speed multiplier.
   * Computed from: waveformData.beat_duration_ms / (60000 / heartRate)
   * This is passed to the canvas animation loop.
   *
   * Example values:
   *   1.0 = real-time playback at the rhythm's native rate
   *   2.0 = 2x faster (higher HR selected)
   *   0.5 = 0.5x slower (lower HR selected)
   */
  playbackSpeed: number;

  // ── Waveform data ──────────────────────────────────────────────────────────

  /**
   * The currently loaded waveform data, or null if not yet loaded.
   * null occurs during initial load or when switching rhythms.
   */
  waveformData: WaveformData | null;

  /** True while waveform JSON is being fetched */
  isLoading: boolean;

  /** Error message if waveform failed to load, or null */
  error: string | null;
}

// =============================================================================
// STORE ACTIONS (what the Zustand store exposes)
// =============================================================================

/**
 * Actions available on the Zustand store.
 * Components call these to update global state.
 */
export interface MonitorActions {
  /** Update the target heart rate and recompute playbackSpeed */
  setHeartRate: (bpm: number) => void;

  /** Change the rhythm and trigger waveform reload */
  setRhythm: (rhythm: Rhythm) => void;

  /** Called by the waveform loader when data arrives */
  setWaveformData: (data: WaveformData) => void;

  /** Called when loading starts */
  setLoading: (loading: boolean) => void;

  /** Called when loading fails */
  setError: (error: string | null) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum allowed heart rate (physiological lower bound for simulation) */
export const HR_MIN = 20;

/** Maximum allowed heart rate (physiological upper bound for simulation) */
export const HR_MAX = 300;

/** Default heart rate on app startup */
export const HR_DEFAULT = 72;

/** Default rhythm on app startup */
export const RHYTHM_DEFAULT: Rhythm = "sinus";

/** All valid rhythms in display order for the dropdown */
export const ALL_RHYTHMS: Rhythm[] = ["sinus", "pvc", "afib", "vt", "vf"];
