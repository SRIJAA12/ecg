import { create } from "zustand";
import type {
  MonitorState,
  MonitorActions,
  ECGRhythm,
  TransferMode,
} from "@/types/ecg";
import {
  HR_DEFAULT,
  RHYTHM_DEFAULT,
  TRANSFER_MODE_DEFAULT,
  TRANSFER_TIME_DEFAULT,
} from "@/types/ecg";

type MonitorStore = MonitorState & MonitorActions;

export const useMonitorStore = create<MonitorStore>((set) => ({
  // ── Initial State ──────────────────────────────────────────────────────────
  heartRate: HR_DEFAULT,
  rhythm: RHYTHM_DEFAULT,
  transferMode: TRANSFER_MODE_DEFAULT,
  transferTime: TRANSFER_TIME_DEFAULT,

  // ── Actions ────────────────────────────────────────────────────────────────
  setHeartRate: (bpm: number) => {
    set({ heartRate: bpm });
  },

  setRhythm: (rhythm: ECGRhythm) => {
    set({ rhythm });
  },

  setTransferMode: (mode: TransferMode) => {
    set({ transferMode: mode });
  },

  setTransferTime: (seconds: number) => {
    set({ transferTime: seconds });
  },
}));

// =============================================================================
// TYPED SELECTORS
// =============================================================================

export const selectHeartRate = (s: MonitorStore) => s.heartRate;
export const selectRhythm = (s: MonitorStore) => s.rhythm;
export const selectTransferMode = (s: MonitorStore) => s.transferMode;
export const selectTransferTime = (s: MonitorStore) => s.transferTime;
