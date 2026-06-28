// src/components/monitor/VitalsPanel.tsx
// Displays HR, rhythm, severity badge, and alarm indicator.

import { useECGStore } from "../../store/ecgStore";
import { RHYTHM_LABELS } from "../../types/ecgState";
import type { RhythmType } from "../../types/ecgState";
import "./VitalsPanel.css";

export default function VitalsPanel() {
  const heartRate = useECGStore((s) => s.heartRate);
  const severity  = useECGStore((s) => s.severity);
  const rhythm    = useECGStore((s) => s.rhythm);
  const connected = useECGStore((s) => s.connected);

  const label = RHYTHM_LABELS[rhythm as RhythmType] ?? rhythm;

  return (
    <div className="vitals-panel">
      <div className="vitals-panel__status">
        <span className={`conn-dot conn-dot--${connected ? "on" : "off"}`} />
        <span className="conn-label">{connected ? "LIVE" : "OFFLINE"}</span>
      </div>

      <div className="vitals-panel__hr">
        <div className="vitals-panel__hr-label">HR</div>
        <div className={`vitals-panel__hr-value vitals-panel__hr-value--${severity}`}>
          {heartRate}
        </div>
        <div className="vitals-panel__hr-unit">bpm</div>
      </div>

      <div className="vitals-panel__rhythm">
        <span className={`badge badge--${severity}`}>
          {severity.toUpperCase()}
        </span>
        <span className="vitals-panel__rhythm-name">{label}</span>
      </div>
    </div>
  );
}
