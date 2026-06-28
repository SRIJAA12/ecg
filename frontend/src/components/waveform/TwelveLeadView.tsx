/**
 * src/components/waveform/TwelveLeadView.tsx
 * ============================================
 * Full-screen modal overlay showing a standard 12-lead ECG printout.
 * Note: 12-lead printout is not available with real-time mathematical generation.
 */

import { useEffect } from "react";
import "./TwelveLeadView.css";

interface Props {
  onClose: () => void;
}

export default function TwelveLeadView({ onClose }: Props) {
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
          <button className="tl-close-btn" onClick={onClose} aria-label="Close 12-lead view">
            ✕
          </button>
        </div>

        {/* ── Message area ───────────────────────────────────────────────── */}
        <div className="tl-canvas-wrap">
          <div className="tl-state">
            <span>12-Lead ECG printout is not available with real-time mathematical generation.</span>
            <span style={{ marginTop: '12px', fontSize: '14px', color: '#666' }}>
              This feature requires pre-recorded 12-lead dataset files.
            </span>
          </div>
        </div>

        {/* ── Footer legend ─────────────────────────────────────────────── */}
        <div className="tl-modal__footer">
          <span>Real-time ECG Generation</span>
        </div>
      </div>
    </div>
  );
}
