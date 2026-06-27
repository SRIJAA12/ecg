/**
 * src/components/waveform/TwelveLeadView.tsx
 * ============================================
 * Full-screen modal overlay showing a standard 12-lead ECG printout.
 * Reads data from the Zustand store so it always matches the live monitor.
 */

import { useEffect, useRef, useCallback } from "react";
import { useMonitorStore } from "@/store/monitorStore";
import { CONDITION_LABELS } from "@/types/ecg";
import "./TwelveLeadView.css";

interface Props {
  onClose: () => void;
}

// =============================================================================
// LAYOUT
// =============================================================================

/** 4-column × 3-row grid layout (standard clinical order) */
const LEAD_LAYOUT: string[][] = [
  ["I",   "aVR",  "V1",  "V4"],
  ["II",  "aVL",  "V2",  "V5"],
  ["III", "aVF",  "V3",  "V6"],
];

/** The rhythm strip at the bottom always shows lead II */
const RHYTHM_STRIP_LEAD = "II";

// =============================================================================
// COLORS
// =============================================================================

const PAPER_BG        = "#fff8f8";        // Warm white (ECG paper)
const GRID_MINOR      = "rgba(255,100,100,0.18)";
const GRID_MAJOR      = "rgba(220,50,50,0.35)";
const TRACE_COLOR     = "#111111";        // Black ink on paper
const LABEL_COLOR     = "#333333";

// =============================================================================
// ECG PAPER CONSTANTS (25 mm/s paper speed, 10 mm/mV gain at 96 dpi)
// 1 mm = ~3.78 px at 96 dpi. We'll use a logical 1mm = 4px for crisp grid.
// =============================================================================

const MM_PX           = 4;               // 1 mm = 4 CSS pixels
const MINOR_MM        = 1;               // minor grid = 1mm
const MAJOR_MM        = 5;              // major grid = 5mm
const MINOR_PX        = MINOR_MM * MM_PX; // 4px
const MAJOR_PX        = MAJOR_MM * MM_PX; // 20px

const PAPER_SPEED_MMS = 25;             // 25 mm/s
const GAIN_MM_PER_MV  = 10;             // 10 mm/mV
const GAIN_PX_PER_MV  = GAIN_MM_PER_MV * MM_PX; // 40px/mV

// =============================================================================
// DRAWING HELPERS
// =============================================================================

/** Draw classic ECG pink grid paper on a canvas context */
function drawPaperGrid(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = PAPER_BG;
  ctx.fillRect(0, 0, W, H);

  // Minor grid (1mm)
  ctx.strokeStyle = GRID_MINOR;
  ctx.lineWidth   = 0.5;
  for (let x = 0; x <= W; x += MINOR_PX) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += MINOR_PX) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Major grid (5mm)
  ctx.strokeStyle = GRID_MAJOR;
  ctx.lineWidth   = 1;
  for (let x = 0; x <= W; x += MAJOR_PX) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += MAJOR_PX) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

/**
 * Draw a single ECG trace from a signal array into a rectangular region.
 * Assumes signal is normalized to [-1, +1] where 1.0 ≈ 1 mV.
 */
function drawLeadTrace(
  ctx:     CanvasRenderingContext2D,
  signal:  number[],
  fs:      number,
  x0:      number,   // left edge of region (CSS px)
  y0:      number,   // top edge of region (CSS px)
  width:   number,   // region width (CSS px)
  height:  number,   // region height (CSS px)
) {
  // How many samples fit in this region at 25 mm/s?
  // pxPerSample = (25 mm/s) * MM_PX / fs
  const pxPerSample = (PAPER_SPEED_MMS * MM_PX) / fs;
  const samplesVisible = Math.floor(width / pxPerSample);
  const centerY = y0 + height / 2;

  ctx.beginPath();
  ctx.strokeStyle = TRACE_COLOR;
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = "round";

  const count = Math.min(samplesVisible, signal.length);
  for (let i = 0; i < count; i++) {
    const x = x0 + i * pxPerSample;
    // signal[i] in [-1, +1], 1.0 = 1 mV = GAIN_PX_PER_MV px deflection
    const y = centerY - signal[i] * GAIN_PX_PER_MV;
    if (i === 0) ctx.moveTo(x, y);
    else         ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** Draw a lead label (e.g., "I", "aVR") in the top-left of its region */
function drawLeadLabel(
  ctx:    CanvasRenderingContext2D,
  label:  string,
  x0:     number,
  y0:     number,
) {
  ctx.fillStyle  = LABEL_COLOR;
  ctx.font       = `bold 11px 'Courier New', monospace`;
  ctx.fillText(label, x0 + 4, y0 + 13);
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function TwelveLeadView({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Read directly from the Zustand store — same data as the live monitor
  const data      = useMonitorStore((s) => s.waveformData);
  const loading   = useMonitorStore((s) => s.isLoading);
  const error     = useMonitorStore((s) => s.error);
  const condition = useMonitorStore((s) => s.condition);
  const conditionLabel = CONDITION_LABELS[condition];

  // Draw when data arrives
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.width  / dpr;
    const H   = canvas.height / dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // ── Grid paper background ─────────────────────────────────────────────
    drawPaperGrid(ctx, W, H);

    // ── Layout dimensions ─────────────────────────────────────────────────
    const COLS         = 4;
    const ROWS         = 3;
    const MARGIN_TOP   = 32;
    const MARGIN_LEFT  = 6;
    const MARGIN_RIGHT = 6;
    const RHYTHM_H     = 70;  // rhythm strip height at bottom
    const HEADER_H     = 20;  // header text above grid cells

    const gridH   = H - MARGIN_TOP - RHYTHM_H;
    const cellW   = (W - MARGIN_LEFT - MARGIN_RIGHT) / COLS;
    const cellH   = gridH / ROWS;

    // ── Title bar ─────────────────────────────────────────────────────────
    ctx.fillStyle  = "#333";
    ctx.font       = "bold 13px 'Courier New', monospace";
    ctx.fillText(`12-Lead ECG  •  Record: ${data.record}  •  ${data.fs} Hz  •  ${data.duration_s.toFixed(1)}s  •  25 mm/s  10 mm/mV`, MARGIN_LEFT + 4, 20);

    // ── Vertical separators between columns ───────────────────────────────
    ctx.strokeStyle = "rgba(180,60,60,0.4)";
    ctx.lineWidth   = 1;
    for (let c = 1; c < COLS; c++) {
      const x = MARGIN_LEFT + c * cellW;
      ctx.beginPath();
      ctx.moveTo(x, MARGIN_TOP);
      ctx.lineTo(x, MARGIN_TOP + gridH);
      ctx.stroke();
    }
    // Horizontal separator above rhythm strip
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, MARGIN_TOP + gridH);
    ctx.lineTo(W - MARGIN_RIGHT, MARGIN_TOP + gridH);
    ctx.stroke();

    // ── Draw 4×3 grid leads ───────────────────────────────────────────────
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const leadName = LEAD_LAYOUT[row][col];
        const signal   = data.leads[leadName];
        if (!signal) continue;

        const x0 = MARGIN_LEFT + col * cellW;
        const y0 = MARGIN_TOP  + row * cellH;

        drawLeadLabel(ctx, leadName, x0, y0);
        drawLeadTrace(ctx, signal, data.fs, x0, y0 + HEADER_H, cellW, cellH - HEADER_H);
      }
    }

    // ── Rhythm strip (full-width Lead II at bottom) ───────────────────────
    const stripY = MARGIN_TOP + gridH;
    const stripSignal = data.leads[RHYTHM_STRIP_LEAD];
    if (stripSignal) {
      drawLeadLabel(ctx, `${RHYTHM_STRIP_LEAD} (Rhythm)`, MARGIN_LEFT, stripY);
      drawLeadTrace(ctx, stripSignal, data.fs, MARGIN_LEFT, stripY + HEADER_H, W - MARGIN_LEFT - MARGIN_RIGHT, RHYTHM_H - HEADER_H);
    }

    ctx.restore();
  }, [data]);

  // Resize canvas to fill the modal and redraw
  const syncAndDraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width  = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw();
  }, [draw]);

  useEffect(() => {
    syncAndDraw();
    const observer = new ResizeObserver(syncAndDraw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [syncAndDraw]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="tl-overlay" role="dialog" aria-modal="true" aria-label="12-Lead ECG printout">
      {/* Backdrop — click to close */}
      <div className="tl-backdrop" onClick={onClose} />

      <div className="tl-modal">
        {/* ── Modal header ──────────────────────────────────────────────── */}
        <div className="tl-modal__header">
          <h2 className="tl-modal__title">12-Lead ECG Printout</h2>
          <div className="tl-modal__meta">
            PTB Diagnostic Database · {conditionLabel}
          </div>
          <button className="tl-close-btn" onClick={onClose} aria-label="Close 12-lead view">
            ✕
          </button>
        </div>

        {/* ── Canvas area ───────────────────────────────────────────────── */}
        <div className="tl-canvas-wrap">
          {loading && (
            <div className="tl-state">
              <div className="tl-spinner" />
              <span>Loading 12-lead data…</span>
            </div>
          )}
          {error && !loading && (
            <div className="tl-state tl-state--error">
              <span>⚠ {error}</span>
            </div>
          )}
          <canvas ref={canvasRef} className="tl-canvas" aria-hidden="true" />
        </div>

        {/* ── Footer legend ─────────────────────────────────────────────── */}
        <div className="tl-modal__footer">
          <span>Speed: 25 mm/s</span>
          <span>Gain: 10 mm/mV</span>
          <span>Source: PTB Diagnostic ECG Database (PhysioNet)</span>
          <span className="tl-footer-link">
            <a href="https://physionet.org/content/ptbdb/1.0.0/" target="_blank" rel="noopener noreferrer">
              physionet.org/content/ptbdb
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
