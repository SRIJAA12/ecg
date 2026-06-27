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
// PTB CONDITIONS — Full Laerdal-style list
// =============================================================================

export type PTBCondition =
  | "normal"
  | "ischemia"
  | "post_ischemia"
  | "inferior_ami"
  | "anterior_ami"
  | "lateral_ami"
  | "lbbb"
  | "rbbb"
  | "lv_hypertrophy"
  | "rv_hypertrophy"
  | "cardiomyopathy"
  | "dysrhythmia"
  | "av_block"
  | "valvular"
  | "myocarditis";

export const CONDITION_LABELS: Record<PTBCondition, string> = {
  normal:         "Sinus Rhythm",
  ischemia:       "Sinus Rhythm with Ischemia",
  post_ischemia:  "Sinus Rhythm, Post Ischemia",
  inferior_ami:   "Sinus with Inferior AMI, ST elevation",
  anterior_ami:   "Sinus with Anterior AMI, ST elevation",
  lateral_ami:    "Sinus with Lateral AMI",
  lbbb:           "Sinus with LBBB",
  rbbb:           "Sinus with RBBB",
  lv_hypertrophy: "Sinus with Left Ventricular Hypertrophy",
  rv_hypertrophy: "Sinus with Right Ventricular Hypertrophy",
  cardiomyopathy: "Cardiomyopathy / Heart Failure",
  dysrhythmia:    "Dysrhythmia (Atrial Fibrillation)",
  av_block:       "AV Block",
  valvular:       "Valvular Heart Disease",
  myocarditis:    "Myocarditis",
};

export type ConditionSeverity = "normal" | "warning" | "critical";

export const CONDITION_SEVERITY: Record<PTBCondition, ConditionSeverity> = {
  normal:         "normal",
  ischemia:       "warning",
  post_ischemia:  "warning",
  inferior_ami:   "critical",
  anterior_ami:   "critical",
  lateral_ami:    "critical",
  lbbb:           "warning",
  rbbb:           "warning",
  lv_hypertrophy: "warning",
  rv_hypertrophy: "warning",
  cardiomyopathy: "critical",
  dysrhythmia:    "warning",
  av_block:       "critical",
  valvular:       "warning",
  myocarditis:    "critical",
};

// Grouping for the Laerdal-style UI sections
export const CONDITION_GROUPS: { label: string; conditions: PTBCondition[] }[] = [
  {
    label: "Sinus / Ischemia",
    conditions: ["normal", "ischemia", "post_ischemia"],
  },
  {
    label: "Myocardial Infarction",
    conditions: ["inferior_ami", "anterior_ami", "lateral_ami"],
  },
  {
    label: "Bundle Branch Blocks",
    conditions: ["lbbb", "rbbb"],
  },
  {
    label: "Hypertrophy",
    conditions: ["lv_hypertrophy", "rv_hypertrophy"],
  },
  {
    label: "Structural Disease",
    conditions: ["cardiomyopathy", "valvular", "myocarditis"],
  },
  {
    label: "Arrhythmia",
    conditions: ["dysrhythmia", "av_block"],
  },
];
// =============================================================================
// WAVEFORM DATA (PTB 12-Lead)
// =============================================================================

export interface PTBWaveformData {
  record: string;
  fs: number;
  duration_s: number;
  num_samples: number;
  leads: Record<string, number[]>;
}

// =============================================================================
// MONITOR STATE
// =============================================================================

export interface MonitorState {
  heartRate: number;
  condition: PTBCondition;
  playbackSpeed: number;
  waveformData: PTBWaveformData | null;
  isLoading: boolean;
  error: string | null;
}

export interface MonitorActions {
  setHeartRate: (bpm: number) => void;
  setCondition: (condition: PTBCondition) => void;
  setWaveformData: (data: PTBWaveformData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const HR_MIN = 0;
export const HR_MAX = 300;
export const HR_DEFAULT = 80;
export const CONDITION_DEFAULT: PTBCondition = "normal";
export const ALL_CONDITIONS: PTBCondition[] = [
  "normal", "ischemia", "post_ischemia",
  "inferior_ami", "anterior_ami", "lateral_ami",
  "lbbb", "rbbb",
  "lv_hypertrophy", "rv_hypertrophy",
  "cardiomyopathy", "dysrhythmia", "av_block",
  "valvular", "myocarditis",
];
