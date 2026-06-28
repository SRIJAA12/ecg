// src/pages/PatientMonitor.tsx
// Real-time bedside monitor page.

import { useEffect } from "react";
import { connect, disconnect } from "../engine/wsClient";
import ECGTrack from "../components/monitor/ECGTrack";
import VitalsPanel from "../components/monitor/VitalsPanel";
import { useECGStore } from "../store/ecgStore";
import "./PatientMonitor.css";

export default function PatientMonitor() {
  const ecgState = useECGStore((s) => s.ecgState);
  const lead     = (ecgState?.lead_selection ?? "II") as any;

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  return (
    <div className="monitor-page">
      <header className="monitor-header">
        <div className="monitor-header__brand">
          <span className="monitor-header__cross">🫀</span>
          <span className="monitor-header__title">SimMan ECG</span>
          <span className="monitor-header__subtitle">PSG IMSR</span>
        </div>
        <div className="monitor-header__info">
          <span className="monitor-header__chip">PHASE 2 ENGINE</span>
          <span className="monitor-header__chip">512 Hz</span>
          <a href="/instructor" className="monitor-header__btn">Instructor Console →</a>
        </div>
      </header>

      <main className="monitor-main">
        <div className="monitor-canvas-area">
          <ECGTrack lead={lead} width={900} height={240} />
        </div>
        <VitalsPanel />
      </main>

      <footer className="monitor-footer">
        <span>Lead: {lead}</span>
        <span>25 mm/s · 10 mm/mV</span>
        <span>SimMan ECG Engine v1.0 — PSG IMSR</span>
      </footer>
    </div>
  );
}
