// src/types/ecgState.ts
// Central TypeScript types mirroring the Python ECGState model.

export type RhythmType =
  | "NSR" | "SINUS_BRADY" | "SINUS_TACHY"
  | "AFIB" | "AFLUTTER" | "JUNCTIONAL"
  | "AVB1" | "AVB2_I" | "AVB2_II" | "AVB3"
  | "PAC" | "PVC" | "SVT"
  | "VT" | "VF" | "TORSADES"
  | "ASYSTOLE" | "PEA"
  | "LBBB" | "RBBB"
  | "ANT_STEMI" | "INF_STEMI" | "LAT_STEMI";

export type IschemiaZone   = "NONE" | "ANTERIOR" | "INFERIOR" | "LATERAL";
export type ArtifactType   = "NONE" | "BASELINE" | "POWERLINE_50" | "POWERLINE_60" | "MOTION" | "EMG";
export type TransferFn     = "IMMEDIATE" | "LINEAR" | "EXPONENTIAL" | "SIGMOID";
export type LeadName       = "I" | "II" | "III" | "aVR" | "aVL" | "aVF" | "V1" | "V2" | "V3" | "V4" | "V5" | "V6";
export type Severity       = "normal" | "warning" | "critical";

export interface ECGState {
  session_id:       string;
  rhythm:           RhythmType;
  heart_rate:       number;
  hrv_std:          number;
  pr_interval:      number;
  qrs_duration:     number;
  qt_interval:      number;
  st_elevation:     number;
  st_depression:    number;
  st_slope:         number;
  ischemia_zone:    IschemiaZone;
  conduction_state: string;
  ectopy_rate:      number;
  artifact_level:   number;
  artifact_type:    ArtifactType;
  transfer_time:    number;
  transfer_fn:      TransferFn;
  lead_selection:   LeadName;
  gain:             number;
  paper_speed:      number;
}

export type ECGStateUpdate = Partial<Omit<ECGState, "session_id">>;

// ─── Rhythm metadata ──────────────────────────────────────────────────────────

export const RHYTHM_LABELS: Record<RhythmType, string> = {
  NSR:         "Normal Sinus Rhythm",
  SINUS_BRADY: "Sinus Bradycardia",
  SINUS_TACHY: "Sinus Tachycardia",
  AFIB:        "Atrial Fibrillation",
  AFLUTTER:    "Atrial Flutter",
  JUNCTIONAL:  "Junctional Rhythm",
  AVB1:        "1st Degree AV Block",
  AVB2_I:      "2nd Degree AV Block – Mobitz I",
  AVB2_II:     "2nd Degree AV Block – Mobitz II",
  AVB3:        "3rd Degree AV Block (Complete)",
  PAC:         "Premature Atrial Contractions",
  PVC:         "Premature Ventricular Contractions",
  SVT:         "Supraventricular Tachycardia",
  VT:          "Ventricular Tachycardia",
  VF:          "Ventricular Fibrillation",
  TORSADES:    "Torsades de Pointes",
  ASYSTOLE:    "Asystole",
  PEA:         "Pulseless Electrical Activity",
  LBBB:        "Left Bundle Branch Block",
  RBBB:        "Right Bundle Branch Block",
  ANT_STEMI:   "Anterior STEMI",
  INF_STEMI:   "Inferior STEMI",
  LAT_STEMI:   "Lateral STEMI",
};

export const RHYTHM_SEVERITY: Record<RhythmType, Severity> = {
  NSR: "normal", SINUS_BRADY: "warning", SINUS_TACHY: "warning",
  AFIB: "warning", AFLUTTER: "warning", JUNCTIONAL: "warning",
  AVB1: "warning", AVB2_I: "warning", AVB2_II: "critical", AVB3: "critical",
  PAC: "warning", PVC: "warning", SVT: "critical",
  VT: "critical", VF: "critical", TORSADES: "critical",
  ASYSTOLE: "critical", PEA: "critical",
  LBBB: "warning", RBBB: "warning",
  ANT_STEMI: "critical", INF_STEMI: "critical", LAT_STEMI: "critical",
};

export const RHYTHM_GROUPS: { label: string; rhythms: RhythmType[] }[] = [
  { label: "Sinus Rhythms",     rhythms: ["NSR", "SINUS_BRADY", "SINUS_TACHY"] },
  { label: "Atrial",            rhythms: ["AFIB", "AFLUTTER", "JUNCTIONAL", "PAC", "SVT"] },
  { label: "AV Conduction",     rhythms: ["AVB1", "AVB2_I", "AVB2_II", "AVB3"] },
  { label: "Ventricular",       rhythms: ["PVC", "VT", "VF", "TORSADES"] },
  { label: "Arrest / PEA",      rhythms: ["ASYSTOLE", "PEA"] },
  { label: "Bundle Branch",     rhythms: ["LBBB", "RBBB"] },
  { label: "ST Elevation / MI", rhythms: ["ANT_STEMI", "INF_STEMI", "LAT_STEMI"] },
];

export const ALL_LEADS: LeadName[] = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
