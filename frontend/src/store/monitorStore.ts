/**
 * src/store/monitorStore.ts
 * =========================
 * Global state management for the Healthcare Simulation Monitor.
 *
 * We use Zustand because:
 *   - Zero boilerplate compared to Redux
 *   - No Context Provider wrapping needed
 *   - Selectors prevent unnecessary re-renders
 *   - Easily extensible for Phase 2 (BP, SpO2, RR, Temp, etc.)
 *
 * Usage in a component:
 *   const heartRate = useMonitorStore(s => s.heartRate);
 *   const setHeartRate = useMonitorStore(s => s.setHeartRate);
 *
 * Why we use selectors (s => s.heartRate) instead of destructuring:
 *   const { heartRate } = useMonitorStore() ← WRONG: re-renders on ANY state change
 *   const heartRate = useMonitorStore(s => s.heartRate) ← CORRECT: re-renders only when heartRate changes
 */

import { create } from "zustand";
import type {
  MonitorState,
  MonitorActions,
  WaveformData,
  Rhythm,
} from "@/types/ecg";
import {
  HR_DEFAULT,
  RHYTHM_DEFAULT,
} from "@/types/ecg";

// =============================================================================
// PLAYBACK SPEED COMPUTATION
// =============================================================================

/**
 * Compute the canvas animation playback speed multiplier.
 *
 * The formula:
 *   speed = nativeRR / targetRR
 *   where:
 *     nativeRR = beat_duration_ms from the waveform JSON (the recorded rate)
 *     targetRR = 60000 / targetHeartRate (the desired rate in ms)
 *
 * Example:
 *   Waveform recorded at 72 bpm → nativeRR = 833ms
 *   User wants 120 bpm          → targetRR = 500ms
 *   speed = 833 / 500 = 1.667   → canvas advances 1.667 samples per frame tick
 *
 * If waveformData is null (not yet loaded), default to 1.0 (real-time).
 */
function computePlaybackSpeed(
  targetHR: number,
  waveformData: WaveformData | null
): number {
  if (!waveformData || targetHR <= 0) return 1.0;

  const nativeRR_ms = waveformData.beat_duration_ms;
  const targetRR_ms = 60000 / targetHR;

  return nativeRR_ms / targetRR_ms;
}

// =============================================================================
// STORE DEFINITION
// =============================================================================

/**
 * Combined type of state + actions (what create() receives and returns).
 */
type MonitorStore = MonitorState & MonitorActions;

/**
 * The Zustand store.
 *
 * Note the naming convention: useMonitorStore (not useMonitorStoreHook).
 * Zustand hooks are named with the "use" prefix so React's linter
 * applies the Rules of Hooks to them correctly.
 */
export const useMonitorStore = create<MonitorStore>((set, get) => ({
  // ── Initial state ───────────────────────────────────────────────────────────

  heartRate: HR_DEFAULT,         // 72 bpm
  rhythm: RHYTHM_DEFAULT,        // "sinus"
  playbackSpeed: 1.0,            // Will update when waveform loads
  waveformData: null,            // Waveform not yet loaded
  isLoading: false,
  error: null,

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * setHeartRate
   * ─────────────
   * Updates the target HR and immediately recomputes playbackSpeed.
   * The canvas animation loop reads playbackSpeed on every frame,
   * so the change takes effect instantly — no lag.
   */
  setHeartRate: (bpm: number) => {
    const { waveformData } = get();
    set({
      heartRate: bpm,
      playbackSpeed: computePlaybackSpeed(bpm, waveformData),
    });
  },

  /**
   * setRhythm
   * ──────────
   * Changes the active rhythm.
   * This triggers the useWaveformLoader hook to fetch the new JSON file.
   * We set isLoading=true and clear the previous waveform immediately
   * so the canvas knows to pause rendering while the new data loads.
   */
  setRhythm: (rhythm: Rhythm) => {
    set({
      rhythm,
      waveformData: null,   // Clear old waveform — canvas will pause
      isLoading: true,      // Signal to UI that load is in progress
      error: null,
    });
  },

  /**
   * setWaveformData
   * ────────────────
   * Called by useWaveformLoader when the JSON fetch succeeds.
   * Immediately recomputes playbackSpeed with the new waveform's beat_duration_ms.
   */
  setWaveformData: (data: WaveformData) => {
    const { heartRate } = get();
    set({
      waveformData: data,
      isLoading: false,
      error: null,
      playbackSpeed: computePlaybackSpeed(heartRate, data),
    });
  },

  /**
   * setLoading
   * ───────────
   * Exposed so the waveform loader can signal loading start.
   */
  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  /**
   * setError
   * ─────────
   * Called when a waveform fails to load. Stores the error message
   * for display in the UI. Clears waveformData so canvas stops.
   */
  setError: (error: string | null) => {
    set({
      error,
      isLoading: false,
      waveformData: error ? null : get().waveformData,
    });
  },
}));

// =============================================================================
// TYPED SELECTORS (optional but helpful for common patterns)
// =============================================================================

// These are pre-built selector functions for the most common state accesses.
// Components can import these instead of writing inline selector lambdas.
// This centralizes selector logic and makes refactoring easier.

/** Select current heart rate */
export const selectHeartRate = (s: MonitorStore) => s.heartRate;

/** Select current rhythm */
export const selectRhythm = (s: MonitorStore) => s.rhythm;

/** Select current playback speed */
export const selectPlaybackSpeed = (s: MonitorStore) => s.playbackSpeed;

/** Select current waveform data */
export const selectWaveformData = (s: MonitorStore) => s.waveformData;

/** Select loading state */
export const selectIsLoading = (s: MonitorStore) => s.isLoading;

/** Select error state */
export const selectError = (s: MonitorStore) => s.error;
