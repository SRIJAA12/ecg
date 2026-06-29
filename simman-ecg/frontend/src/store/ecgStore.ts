// src/store/ecgStore.ts
// Zustand store — mirrors ECGState from backend + manages sample ring buffer.

import { create } from "zustand";
import type { ECGState, ECGStateUpdate, LeadName, Severity, TransferFn, RhythmProfile } from "../types/ecgState";
import type { DecodedPacket, ECGIntelligenceMsg } from "../types/wsProtocol";
import { SAMPLE_RATE } from "../types/wsProtocol";
import { RHYTHM_SEVERITY, RHYTHM_INTELLIGENCE } from "../types/ecgState";

/** Ring buffer holding 10 seconds of samples per lead */
const BUFFER_SECONDS = 10;
const BUFFER_SIZE    = SAMPLE_RATE * BUFFER_SECONDS;  // 5120

function makeLeadBuffer(): Record<LeadName, Float32Array> {
  const leads: Partial<Record<LeadName, Float32Array>> = {};
  for (const l of ["I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6"] as LeadName[]) {
    leads[l] = new Float32Array(BUFFER_SIZE);
  }
  return leads as Record<LeadName, Float32Array>;
}

export interface ECGStore {
  // Live state
  ecgState:     ECGState | null;
  heartRate:    number; // instructor target
  liveHeartRate: number; // value currently emitted by the engine
  severity:     Severity;
  rhythm:       string;
  transferTime: number;
  transferFn:   TransferFn;
  connected:    boolean;

  // Rhythm Intelligence
  rhythmIntelligence: RhythmProfile | null;

  // Sample ring buffers (written by WS, read by canvas renderer)
  buffer:       Record<LeadName, Float32Array>;
  bufferHead:   number;     // next write index (wraps at BUFFER_SIZE)

  // Trend data (last 60 HR points)
  hrTrend:      number[];

  // Actions
  onPacket:       (pkt: DecodedPacket) => void;
  onState:        (state: ECGState) => void;
  onIntelligence: (payload: ECGIntelligenceMsg["payload"]) => void;
  setConnected:   (v: boolean) => void;
  sendCommand:    (update: ECGStateUpdate) => void;   // set by wsClient

  // WS send reference (set by wsClient)
  _sendFn:      ((update: ECGStateUpdate) => void) | null;
  _setSendFn:   (fn: (update: ECGStateUpdate) => void) => void;
}

export const useECGStore = create<ECGStore>((set, get) => ({
  ecgState:   null,
  heartRate:  80,
  liveHeartRate: 80,
  severity:   "normal",
  rhythm:     "NSR",
  transferTime: 5,
  transferFn:   "SIGMOID",
  connected:  false,
  rhythmIntelligence: RHYTHM_INTELLIGENCE["NSR"] ?? null,
  buffer:     makeLeadBuffer(),
  bufferHead: 0,
  hrTrend:    [],
  _sendFn:    null,

  onPacket: (pkt) => {
    const store = get();
    const head  = store.bufferHead;
    const n     = pkt.nSamples;

    // Write samples into ring buffer
    for (const [lead, arr] of Object.entries(pkt.leads) as [LeadName, Float32Array][]) {
      const buf = store.buffer[lead];
      if (!buf) continue;
      const end = head + n;
      if (end <= BUFFER_SIZE) {
        buf.set(arr, head);
      } else {
        const first = BUFFER_SIZE - head;
        buf.set(arr.subarray(0, first), head);
        buf.set(arr.subarray(first), 0);
      }
    }

    const newHead = (head + n) % BUFFER_SIZE;
    const severityMap: Severity[] = ["normal", "warning", "critical"];

    set((s) => ({
      bufferHead: newHead,
      liveHeartRate: Math.round(pkt.heartRate),
      severity:   severityMap[pkt.severity] ?? "normal",
      rhythm:     pkt.rhythm,
      hrTrend:    [...s.hrTrend.slice(-59), Math.round(pkt.heartRate)],
    }));
  },

  onState: (state) => {
    console.log("[STORE] onState:", {
      heartRate: Math.round(state.heart_rate),
      rhythm: state.rhythm,
      transferTime: state.transfer_time,
      transferFn: state.transfer_fn,
    });
    set((current) => ({
      ecgState: state,
      heartRate: current.ecgState === null
        ? Math.round(state.heart_rate)
        : current.heartRate,
      liveHeartRate: Math.round(state.heart_rate),
      severity: RHYTHM_SEVERITY[state.rhythm as keyof typeof RHYTHM_SEVERITY] ?? "normal",
      rhythm:   state.rhythm,
      transferTime: state.transfer_time,
      transferFn: state.transfer_fn,
      // Sync rhythm intelligence from static table on state snapshot
      rhythmIntelligence: RHYTHM_INTELLIGENCE[state.rhythm as keyof typeof RHYTHM_INTELLIGENCE] ?? null,
    }));
  },

  onIntelligence: (payload) => {
    // When backend sends ECG_INTELLIGENCE, update the local intelligence state
    // The frontend static table is the primary source; the backend payload confirms the rhythm.
    const profile = RHYTHM_INTELLIGENCE[payload.rhythm as keyof typeof RHYTHM_INTELLIGENCE];
    if (profile) {
      set({ rhythmIntelligence: profile });
    }
    console.log("[STORE] onIntelligence:", payload.rhythm, payload.p_wave, payload.t_wave);
  },

  setConnected: (v) => set({ connected: v }),

  sendCommand: (update) => {
    const fn = get()._sendFn;
    console.log("[STORE] sendCommand called. _sendFn is:", !!fn, update);
    if (fn) fn(update);

    const currentState = get().ecgState;
    set(() => ({
      heartRate: update.heart_rate !== undefined ? Math.round(update.heart_rate) : get().heartRate,
      rhythm: update.rhythm ?? get().rhythm,
      transferTime: update.transfer_time ?? get().transferTime,
      transferFn: update.transfer_fn ?? get().transferFn,
      severity: update.rhythm
        ? RHYTHM_SEVERITY[update.rhythm as keyof typeof RHYTHM_SEVERITY] ?? get().severity
        : get().severity,
      ecgState: currentState ? { ...currentState, ...update } : currentState,
      // Eagerly update rhythm intelligence when rhythm changes
      rhythmIntelligence: update.rhythm
        ? RHYTHM_INTELLIGENCE[update.rhythm as keyof typeof RHYTHM_INTELLIGENCE] ?? get().rhythmIntelligence
        : get().rhythmIntelligence,
    }));
  },

  _setSendFn: (fn) => set({ _sendFn: fn }),
}));

