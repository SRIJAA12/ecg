// src/types/wsProtocol.ts
// WebSocket message types for the SimMan ECG stream.

import type { ECGState, ECGStateUpdate, LeadName } from "./ecgState";

export const LEAD_ORDER: LeadName[] = [
  "I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6"
];

export const SAMPLE_RATE = 512;   // Hz — must match backend
export const PACKET_MS   = 50;    // ms per WebSocket packet

/** Number of samples per packet sent by the server */
export const SAMPLES_PER_PKT = Math.round(SAMPLE_RATE * PACKET_MS / 1000); // 26

// ─── Binary packet layout (big-endian) ──────────────────────────────────────
//
//  [0–1]  Uint16  magic = 0xECEC
//  [2–5]  Float32 heart_rate
//  [6–7]  Uint16  n_samples
//  [8–9]  Uint16  n_leads (= 12)
//  For each of 12 leads (in LEAD_ORDER):
//    [n_samples × 4 bytes]  Float32 array
//  [header_end + 0]  Uint8 severity (0=normal,1=warning,2=critical)
//  [header_end + 1]  Uint8 rhythm_len
//  [header_end + 2 … ]  ASCII rhythm string

export interface DecodedPacket {
  heartRate:  number;
  nSamples:   number;
  leads:      Record<LeadName, Float32Array>;
  severity:   0 | 1 | 2;
  rhythm:     string;
}

export function decodePacket(buffer: ArrayBuffer): DecodedPacket | null {
  const view = new DataView(buffer);
  let offset = 0;

  const magic = view.getUint16(offset, false); offset += 2;
  if (magic !== 0xECEC) return null;

  const heartRate = view.getFloat32(offset, false); offset += 4;
  const nSamples  = view.getUint16(offset, false);  offset += 2;
  const nLeads    = view.getUint16(offset, false);  offset += 2;

  const leads: Partial<Record<LeadName, Float32Array>> = {};
  for (let i = 0; i < nLeads && i < LEAD_ORDER.length; i++) {
    const alignedBuffer = new ArrayBuffer(nSamples * 4);
    new Uint8Array(alignedBuffer).set(new Uint8Array(buffer, offset, nSamples * 4));
    leads[LEAD_ORDER[i]] = new Float32Array(alignedBuffer);
    offset += nSamples * 4;
  }

  const severity  = view.getUint8(offset) as 0 | 1 | 2; offset += 1;
  const rhytLen   = view.getUint8(offset);               offset += 1;
  const bytes     = new Uint8Array(buffer, offset, rhytLen);
  const rhythm    = new TextDecoder().decode(bytes);

  return { heartRate, nSamples, leads: leads as Record<LeadName, Float32Array>, severity, rhythm };
}

// ─── JSON message types ───────────────────────────────────────────────────────

export interface StateSnapshotMsg {
  type:    "STATE_SNAPSHOT";
  payload: ECGState;
}

export interface SetStateMsg {
  type:    "SET_STATE";
  payload: ECGStateUpdate;
}

export interface PingMsg  { type: "PING"; }
export interface PongMsg  { type: "PONG"; }

export type ServerMsg = StateSnapshotMsg | PongMsg;
export type ClientMsg = SetStateMsg | { type: "GET_STATE" } | PingMsg;
