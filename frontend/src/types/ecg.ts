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
// ECG RHYTHMS — Full Laerdal-style list
// =============================================================================

export type ECGRhythm =
  | "normal_sinus"
  | "sinus_bradycardia"
  | "sinus_tachycardia"
  | "atrial_fibrillation"
  | "pvc"
  | "ventricular_tachycardia"
  | "ventricular_fibrillation"
  | "asystole"
  | "pea"
  | "lbbb"
  | "rbbb"
  | "stemi";

export const RHYTHM_LABELS: Record<ECGRhythm, string> = {
  normal_sinus:           "Normal Sinus Rhythm",
  sinus_bradycardia:      "Sinus Bradycardia",
  sinus_tachycardia:      "Sinus Tachycardia",
  atrial_fibrillation:    "Atrial Fibrillation",
  pvc:                    "PVC",
  ventricular_tachycardia: "Ventricular Tachycardia",
  ventricular_fibrillation: "Ventricular Fibrillation",
  asystole:               "Asystole",
  pea:                    "PEA",
  lbbb:                   "Left Bundle Branch Block",
  rbbb:                   "Right Bundle Branch Block",
  stemi:                  "STEMI",
};

export type ConditionSeverity = "normal" | "warning" | "critical";

export const RHYTHM_SEVERITY: Record<ECGRhythm, ConditionSeverity> = {
  normal_sinus:           "normal",
  sinus_bradycardia:      "warning",
  sinus_tachycardia:      "warning",
  atrial_fibrillation:    "warning",
  pvc:                    "warning",
  ventricular_tachycardia: "critical",
  ventricular_fibrillation: "critical",
  asystole:               "critical",
  pea:                    "critical",
  lbbb:                   "warning",
  rbbb:                   "warning",
  stemi:                  "critical",
};

// Grouping for the Laerdal-style UI sections
export const RHYTHM_GROUPS: { label: string; rhythms: ECGRhythm[] }[] = [
  {
    label: "Normal Sinus",
    rhythms: ["normal_sinus", "sinus_bradycardia", "sinus_tachycardia"],
  },
  {
    label: "Arrhythmias",
    rhythms: ["atrial_fibrillation", "pvc", "ventricular_tachycardia", "ventricular_fibrillation"],
  },
  {
    label: "Cardiac Arrest",
    rhythms: ["asystole", "pea"],
  },
  {
    label: "Conduction Abnormalities",
    rhythms: ["lbbb", "rbbb"],
  },
  {
    label: "Ischemia",
    rhythms: ["stemi"],
  },
];

// =============================================================================
// TRANSFER FUNCTION
// =============================================================================

export type TransferMode = "immediate" | "linear" | "exponential";

export const TRANSFER_MODE_LABELS: Record<TransferMode, string> = {
  immediate: "Immediate",
  linear: "Linear",
  exponential: "Exponential",
};
// =============================================================================
// MONITOR STATE
// =============================================================================

export interface MonitorState {
  heartRate: number;
  rhythm: ECGRhythm;
  transferMode: TransferMode;
  transferTime: number;
}

export interface MonitorActions {
  setHeartRate: (bpm: number) => void;
  setRhythm: (rhythm: ECGRhythm) => void;
  setTransferMode: (mode: TransferMode) => void;
  setTransferTime: (seconds: number) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const HR_MIN = 0;
export const HR_MAX = 300;
export const HR_DEFAULT = 80;
export const RHYTHM_DEFAULT: ECGRhythm = "normal_sinus";
export const TRANSFER_MODE_DEFAULT: TransferMode = "immediate";
export const TRANSFER_TIME_DEFAULT = 2;
export const ALL_RHYTHMS: ECGRhythm[] = [
  "normal_sinus", "sinus_bradycardia", "sinus_tachycardia",
  "atrial_fibrillation", "pvc", "ventricular_tachycardia",
  "ventricular_fibrillation", "asystole", "pea",
  "lbbb", "rbbb", "stemi",
];
