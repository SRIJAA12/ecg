/**
 * src/pages/MonitorPage.tsx
 * =========================
 * The main ECG monitor page — the full UI assembled from all components.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────┐
 * │  🫀 Healthcare Simulation Monitor     ● LIVE  MIT-BIH    │ ← header
 * ├──────────────────────────────────────────────────────────┤
 * │  ┌──────────────── ECG CANVAS ─────────────┐  ┌──────┐  │
 * │  │                                          │  │  72  │  │
 * │  │     (scrolling ECG waveform)             │  │  BPM │  │
 * │  │                                          │  │ Sinus│  │
 * │  └──────────────────────────────────────────┘  └──────┘  │
 * ├──────────────────────────────────────────────────────────┤
 * │  Heart Rate ────────●──────  72 BPM  |  Rhythm [NSR ▾]  │ ← controls
 * └──────────────────────────────────────────────────────────┘
 */

import { useState } from "react";
import { useMonitorStore } from "@/store/monitorStore";
import { RHYTHM_SEVERITY } from "@/types/ecg";
import ECGCanvas from "@/components/waveform/ECGCanvas";
import ControlPanel from "@/components/monitor/ControlPanel";
import TwelveLeadView from "@/components/waveform/TwelveLeadView";
import "./MonitorPage.css";

export default function MonitorPage() {
  const [show12Lead, setShow12Lead] = useState(false);
  const heartRate = useMonitorStore((s) => s.heartRate);
  const rhythm = useMonitorStore((s) => s.rhythm);
  const severity  = RHYTHM_SEVERITY[rhythm];

  return (
    <div className="monitor-page">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="monitor-header">
        <div className="monitor-header__left">
          <span className="monitor-live-dot blink" aria-hidden="true" />
          <h1 className="monitor-title">Healthcare Simulation Monitor</h1>
        </div>
        <div className="monitor-header__right">
          <button 
            className="btn btn--secondary" 
            onClick={() => setShow12Lead(true)}
            style={{ marginRight: '16px' }}
          >
            📄 Print 12-Lead ECG
          </button>
          <span className="monitor-source">Real-time ECG Generation</span>
          <span className="badge badge--normal monitor-phase">Phase 3</span>
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="monitor-main">

        {/* ── Waveform + Vitals row (Unified Track) ────────────────────────── */}
        <div className="monitor-track">

          {/* ECG Canvas: takes up most horizontal space */}
          <div className="monitor-track__canvas">
            <ECGCanvas />
          </div>

          {/* Digital vitals readout: right side, integrated */}
          <aside className="monitor-track__vitals" aria-label="Vital signs readout">

            <div className={`vital-block vital-block--${severity}`}>
              <div className="vital-block__header">
                <span className="vital-block__label">HR</span>
                <span className="vital-block__alarm">130<br/> 50</span>
                <span className="vital-block__pulse">Pulse<br/><span className="pulse-val">78</span></span>
              </div>
              <div
                className="vital-block__value font-mono"
                aria-label={`Heart rate ${heartRate} beats per minute`}
              >
                {heartRate}
              </div>
            </div>

          </aside>
        </div>

        {/* ── Control panel ───────────────────────────────────────────────── */}
        <ControlPanel />

      </main>

      {/* ── 12-Lead Full-Screen Modal ─────────────────────────────────────── */}
      {show12Lead && <TwelveLeadView onClose={() => setShow12Lead(false)} />}
    </div>
  );
}
