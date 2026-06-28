/**
 * src/hooks/useECGAnimation.ts
 * ============================
 * Drives the ECG canvas animation using requestAnimationFrame.
 * Uses real-time mathematical ECG generation instead of pre-recorded datasets.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { ECGRhythm } from "@/types/ecg";
import { RHYTHM_SEVERITY } from "@/types/ecg";
import { getECGGenerator } from "@/utils/ecgGenerator";

// =============================================================================
// CONSTANTS
// =============================================================================

const DISPLAY_DURATION_SEC = 6;
const AMPLITUDE_RATIO = 0.38;
const CANVAS_BG = "#060a10";
const SAMPLE_RATE = 250; // Hz

const GRID_MAJOR_COLOR  = "rgba(0, 230, 118, 0.11)";
const GRID_MINOR_COLOR  = "rgba(0, 230, 118, 0.045)";
const GRID_CENTER_COLOR = "rgba(0, 230, 118, 0.18)";

/** Trace color per condition severity */
const SEVERITY_COLORS: Record<string, string> = {
  normal:   "#00e676",
  warning:  "#ffeb3b",
  critical: "#ff5722",
};

const SEVERITY_GLOW: Record<string, number> = {
  normal:   2,
  warning:  3,
  critical: 4,
};

// =============================================================================
// HOOK
// =============================================================================

export function useECGAnimation(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  rhythm: ECGRhythm,
  heartRate: number,
  transferMode: "immediate" | "linear" | "exponential",
  transferTime: number
): void {
  const generatorRef = useRef(getECGGenerator());
  const lastTimestampRef = useRef(0);
  const rafRef = useRef(0);
  const elapsedTimeRef = useRef(0);

  // Update generator parameters when store changes
  useEffect(() => {
    generatorRef.current.setRhythm(rhythm);
  }, [rhythm]);

  useEffect(() => {
    generatorRef.current.setHeartRate(heartRate);
  }, [heartRate]);

  useEffect(() => {
    generatorRef.current.setTransferMode(transferMode);
  }, [transferMode]);

  useEffect(() => {
    generatorRef.current.setTransferTime(transferTime);
  }, [transferTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const severity = RHYTHM_SEVERITY[rhythm];
    const traceColor = SEVERITY_COLORS[severity] ?? "#00e676";
    const glowBlur   = SEVERITY_GLOW[severity] ?? 3;

    lastTimestampRef.current = 0;
    elapsedTimeRef.current = DISPLAY_DURATION_SEC; // Start with time offset so left side shows waveform

    function frame(timestamp: number) {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas!.width  / dpr;
      const H = canvas!.height / dpr;

      const ctx = canvas!.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);

      if (lastTimestampRef.current === 0) lastTimestampRef.current = timestamp;
      const deltaMs = Math.min(timestamp - lastTimestampRef.current, 100);
      lastTimestampRef.current = timestamp;
      elapsedTimeRef.current += deltaMs / 1000;

      ctx!.fillStyle = CANVAS_BG;
      ctx!.fillRect(0, 0, W, H);

      drawGrid(ctx!, W, H, SAMPLE_RATE, SAMPLE_RATE * DISPLAY_DURATION_SEC);

      const centerY   = H / 2;
      const amplitude = H * AMPLITUDE_RATIO;

      ctx!.beginPath();
      ctx!.strokeStyle = traceColor;
      ctx!.lineWidth   = 1.5;
      ctx!.lineJoin    = "round";
      ctx!.lineCap     = "round";
      ctx!.shadowColor = traceColor;
      ctx!.shadowBlur  = glowBlur;

      let penDown = false;
      const currentTime = elapsedTimeRef.current;

      // Draw waveform from right to left (scrolling ECG)
      // Right edge shows current time, left edge shows older time
      for (let px = W; px >= 0; px -= 1) {
        const timeOffset = (W - px) / W * DISPLAY_DURATION_SEC;
        const sampleTime = currentTime - timeOffset;
        
        const value = generatorRef.current.generateSample(sampleTime);
        const y = centerY - value * amplitude;

        if (!penDown) { ctx!.moveTo(px, y); penDown = true; }
        else          { ctx!.lineTo(px, y); }
      }

      ctx!.stroke();
      ctx!.shadowBlur = 0;
      ctx.restore();

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [rhythm]);
}

// =============================================================================
// DRAWING HELPERS
// =============================================================================

function drawGrid(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fs: number,
  samplesVisible: number
): void {
  const pxPerSample = W / samplesVisible;

  const minorIntervalPx = pxPerSample * (fs * 0.04);
  ctx.strokeStyle = GRID_MINOR_COLOR;
  ctx.lineWidth   = 0.5;
  for (let x = 0; x <= W; x += minorIntervalPx) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  const majorIntervalPx = pxPerSample * (fs * 0.2);
  ctx.strokeStyle = GRID_MAJOR_COLOR;
  ctx.lineWidth   = 0.5;
  for (let x = 0; x <= W; x += majorIntervalPx) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  const centerY   = H / 2;
  const amplitude = H * AMPLITUDE_RATIO;

  ctx.strokeStyle = GRID_CENTER_COLOR;
  ctx.lineWidth   = 0.5;
  ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(W, centerY); ctx.stroke();

  ctx.strokeStyle = GRID_MAJOR_COLOR;
  ctx.lineWidth   = 0.5;
  for (const offset of [-amplitude, amplitude]) {
    ctx.beginPath(); ctx.moveTo(0, centerY + offset); ctx.lineTo(W, centerY + offset); ctx.stroke();
  }
}
