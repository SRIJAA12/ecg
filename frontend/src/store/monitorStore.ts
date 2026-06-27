import { create } from "zustand";
import type {
  MonitorState,
  MonitorActions,
  PTBCondition,
  PTBWaveformData,
} from "@/types/ecg";
import {
  HR_DEFAULT,
  CONDITION_DEFAULT,
} from "@/types/ecg";

type MonitorStore = MonitorState & MonitorActions;

export const useMonitorStore = create<MonitorStore>((set, get) => ({
  // ── Initial State ──────────────────────────────────────────────────────────
  heartRate: HR_DEFAULT,
  condition: CONDITION_DEFAULT,
  playbackSpeed: 1.0,

  waveformData: null,
  isLoading: false,
  error: null,

  // ── Actions ────────────────────────────────────────────────────────────────
  setHeartRate: (bpm: number) => {
    set({
      heartRate: bpm,
      playbackSpeed: bpm / HR_DEFAULT,
    });
  },

  setCondition: (condition: PTBCondition) => {
    set({
      condition,
      waveformData: null,
      isLoading: true,
      error: null,
    });
  },

  setWaveformData: (data: PTBWaveformData) => {
    const { heartRate } = get();
    set({
      waveformData: data,
      isLoading: false,
      error: null,
      playbackSpeed: heartRate / HR_DEFAULT,
    });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setError: (error: string | null) => {
    set({
      error,
      isLoading: false,
      waveformData: error ? null : get().waveformData,
    });
  },
}));

// =============================================================================
// TYPED SELECTORS
// =============================================================================

export const selectHeartRate = (s: MonitorStore) => s.heartRate;
export const selectCondition = (s: MonitorStore) => s.condition;
export const selectPlaybackSpeed = (s: MonitorStore) => s.playbackSpeed;
export const selectWaveformData = (s: MonitorStore) => s.waveformData;
export const selectIsLoading = (s: MonitorStore) => s.isLoading;
export const selectError = (s: MonitorStore) => s.error;
