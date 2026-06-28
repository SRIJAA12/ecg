/**
 * src/components/waveform/ECGCanvas.tsx
 * ======================================
 * Live scrolling ECG display using real-time mathematical generation.
 */

import { useRef, useEffect, useCallback } from "react";
import { useMonitorStore } from "@/store/monitorStore";
import { useECGAnimation } from "@/hooks/useECGAnimation";
import "./ECGCanvas.css";

const CANVAS_HEIGHT_PX = 260;

export default function ECGCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rhythm        = useMonitorStore((s) => s.rhythm);
  const heartRate     = useMonitorStore((s) => s.heartRate);
  const transferMode  = useMonitorStore((s) => s.transferMode);
  const transferTime  = useMonitorStore((s) => s.transferTime);

  useECGAnimation(canvasRef, rhythm, heartRate, transferMode, transferTime);

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

      <div className="ecg-watermark">
        <span className="ecg-lead">II</span>
        <span className="ecg-speed">25 mm/s</span>
      </div>
    </div>
  );
}
