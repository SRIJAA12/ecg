/**
 * src/hooks/useECGAnimation.ts
 * ============================
 * Drives the ECG canvas animation using requestAnimationFrame.
 * Reads Lead II from the PTB 12-lead data and scrolls it at 25 mm/s.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { PTBWaveformData, PTBCondition } from "@/types/ecg";
import { CONDITION_SEVERITY } from "@/types/ecg";

// =============================================================================
// CONSTANTS
// =============================================================================

const DISPLAY_DURATION_SEC = 6;
const AMPLITUDE_RATIO = 0.38;
const CANVAS_BG = "#060a10";

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
  waveformData: PTBWaveformData | null,
  playbackSpeed: number,
  condition: PTBCondition
): void {
  const speedRef = useRef(playbackSpeed);
  useEffect(() => {
    speedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  const headIndexRef     = useRef(0.0);
  const lastTimestampRef = useRef(0);
  const rafRef           = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const severity = CONDITION_SEVERITY[condition];
    const traceColor = SEVERITY_COLORS[severity] ?? "#00e676";
    const glowBlur   = SEVERITY_GLOW[severity] ?? 3;

    // If no waveform yet: draw a static flat dashed line
    if (!waveformData) {
      drawFlatLine(ctx, canvas, traceColor);
      return;
    }

    // Extract Lead II for the live scrolling monitor
    const signal = waveformData.leads["II"] ?? waveformData.leads[Object.keys(waveformData.leads)[0]];
    const fs = waveformData.fs;
    const signalLength = signal.length;

    headIndexRef.current     = 0.0;
    lastTimestampRef.current = 0;

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

      const advance = (deltaMs / 1000) * fs * speedRef.current;
      headIndexRef.current = (headIndexRef.current + advance) % signalLength;
      const head = headIndexRef.current;

      ctx!.fillStyle = CANVAS_BG;
      ctx!.fillRect(0, 0, W, H);

      const gridSamplesVisible = fs * DISPLAY_DURATION_SEC;
      drawGrid(ctx!, W, H, fs, gridSamplesVisible);

      const signalSamplesVisible = fs * DISPLAY_DURATION_SEC * speedRef.current;
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
      const W_physical = canvas!.width;

      for (let physicalPx = 0; physicalPx < W_physical; physicalPx++) {
        const px = physicalPx / dpr;
        const samplesBack = (1 - physicalPx / (W_physical - 1)) * signalSamplesVisible;
        const rawIdx    = head - samplesBack;
        const sampleIdx = ((Math.round(rawIdx) % signalLength) + signalLength) % signalLength;
        const value = signal[sampleIdx];
        const y     = centerY - value * amplitude;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveformData, condition]);
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

function drawFlatLine(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  color: string
): void {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width  / dpr;
  const H = canvas.height / dpr;
  const centerY = H / 2;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.globalAlpha = 0.3;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(W, centerY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.restore();
}
