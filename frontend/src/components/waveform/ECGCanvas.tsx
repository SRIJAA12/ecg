/**
 * src/components/waveform/ECGCanvas.tsx
 * ======================================
 * Live scrolling ECG display (Lead II from PTB data).
 */

import { useRef, useEffect, useCallback } from "react";
import { useMonitorStore } from "@/store/monitorStore";
import { useWaveformLoader } from "@/hooks/useWaveformLoader";
import { useECGAnimation } from "@/hooks/useECGAnimation";
import "./ECGCanvas.css";

const CANVAS_HEIGHT_PX = 260;

export default function ECGCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const waveformData  = useMonitorStore((s) => s.waveformData);
  const playbackSpeed = useMonitorStore((s) => s.playbackSpeed);
  const condition     = useMonitorStore((s) => s.condition);
  const isLoading     = useMonitorStore((s) => s.isLoading);
  const error         = useMonitorStore((s) => s.error);

  useWaveformLoader();
  useECGAnimation(canvasRef, waveformData, playbackSpeed, condition);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetWidth  = Math.round(width * dpr);
    const targetHeight = Math.round(CANVAS_HEIGHT_PX * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width  = targetWidth;
      canvas.height = targetHeight;
    }
  }, []);

  useEffect(() => {
    syncCanvasSize();
    const observer = new ResizeObserver(syncCanvasSize);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [syncCanvasSize]);

  return (
    <div className="ecg-canvas-container">
      <canvas
        ref={canvasRef}
        className="ecg-canvas"
        aria-label="ECG waveform display - Lead II"
        role="img"
      />

      {isLoading && (
        <div className="ecg-overlay ecg-overlay--loading">
          <div className="ecg-spinner" />
          <span>Loading waveform...</span>
        </div>
      )}

      {error && !isLoading && (
        <div className="ecg-overlay ecg-overlay--error">
          <span className="ecg-error-icon">⚠</span>
          <div>
            <p className="ecg-error-title">Waveform Unavailable</p>
            <p className="ecg-error-hint">
              Run: <code>python -m converter.convert_12lead</code>
            </p>
          </div>
        </div>
      )}

      {waveformData && (
        <div className="ecg-watermark">
          <span className="ecg-lead">II</span>
          <span className="ecg-speed">25 mm/s</span>
        </div>
      )}
    </div>
  );
}
