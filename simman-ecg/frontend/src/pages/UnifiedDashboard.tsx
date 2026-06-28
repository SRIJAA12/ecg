// src/pages/UnifiedDashboard.tsx
import { useEffect, useState } from "react";
import { useECGStore } from "../store/ecgStore";
import { connect, disconnect } from "../engine/wsClient";
import ECGTrack from "../components/monitor/ECGTrack";
import {
  RHYTHM_GROUPS, RHYTHM_LABELS, ALL_LEADS,
  type RhythmType, type ArtifactType, type TransferFn
} from "../types/ecgState";
import "./UnifiedDashboard.css";

export default function UnifiedDashboard() {
  const ecgState    = useECGStore((s) => s.ecgState);
  const heartRate   = useECGStore((s) => s.heartRate);
  const liveHeartRate = useECGStore((s) => s.liveHeartRate);
  const severity    = useECGStore((s) => s.severity);
  const connected   = useECGStore((s) => s.connected);
  const transferTime = useECGStore((s) => s.transferTime);
  const transferFn   = useECGStore((s) => s.transferFn);
  const rhythmValue  = useECGStore((s) => s.rhythm);
  const sendCommand = useECGStore((s) => s.sendCommand);

  const [stElev,        setStElev]        = useState(0);
  const [stDepr,        setStDepr]        = useState(0);
  const [artifactLevel, setArtifactLevel] = useState(0);
  const [artifactType,  setArtifactType]  = useState<ArtifactType>("NONE");
  const [selectedLead,  setSelectedLead]  = useState<"I"|"II"|"III"|"aVR"|"aVL"|"aVF"|"V1"|"V2"|"V3"|"V4"|"V5"|"V6">("II");

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  useEffect(() => {
    if (!ecgState) return;
    setStElev(ecgState.st_elevation);
    setStDepr(ecgState.st_depression);
    setArtifactLevel(ecgState.artifact_level);
    setArtifactType(ecgState.artifact_type);
  }, [ecgState?.session_id]);

  const rhythm = (rhythmValue || ecgState?.rhythm || "NSR") as RhythmType;

  const handleHRChange = (val: number) => {
    console.log("HR Slider Changed:", val);
    sendCommand({ heart_rate: val, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handleRhythmChange = (r: RhythmType) => {
    console.log("Selected Rhythm:", r);
    sendCommand({ rhythm: r, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handleSTChange = (elev: number, depr: number) => {
    console.log("Store Updated: ST", elev, depr);
    setStElev(elev);
    setStDepr(depr);
    sendCommand({ st_elevation: elev, st_depression: depr, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const handleArtifactChange = (level: number, type: ArtifactType) => {
    console.log("Store Updated: Artifact", level, type);
    setArtifactLevel(level);
    setArtifactType(type);
    sendCommand({ artifact_level: level, artifact_type: type });
  };

  return (
    <div className="dashboard">
      
      {/* HEADER */}
      <header className="dashboard-header">
        <div className="dashboard-brand">🫀 SimMan ECG Engine</div>
        <div className={`ws-status ws-status--${connected ? "on" : "off"}`}>
          {connected ? "LIVE CONNECTED" : "RECONNECTING..."}
        </div>
      </header>

      <div className="dashboard-content">
        {/* LEFT PANEL: The Monitor / Waveform */}
        <section className="monitor-panel">
          
          <div className="vitals-strip">
            <div className="vital-card">
              <div className="vital-label">HEART RATE</div>
              <div className={`vital-value vital-value--${severity}`}>{liveHeartRate}</div>
              <div className="vital-unit">BPM</div>
            </div>
            <div className="vital-card rhythm-card">
              <div className="vital-label">CURRENT RHYTHM</div>
              <div className="vital-text">{RHYTHM_LABELS[rhythm as RhythmType] ?? rhythm}</div>
            </div>
            <div className="vital-card lead-card">
              <div className="vital-label">MONITOR LEAD</div>
              <select value={selectedLead} onChange={(e) => setSelectedLead(e.target.value as any)}>
                {ALL_LEADS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="waveform-container">
            {/* The single unified ECG track */}
            <ECGTrack lead={selectedLead} width={900} height={400} />
          </div>

        </section>

        {/* RIGHT PANEL: The Controls */}
        <section className="controls-panel">
          <div className="controls-scroll">
            
            <div className="control-card">
              <h3>Transfer Behavior</h3>
              <p className="control-help">How changes (like HR) transition over time.</p>
              <div className="control-row">
                <label>
                  <span>Time (s)</span>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={transferTime}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      console.log("Store Updated: transferTime", next);
                      sendCommand({ transfer_time: next, transfer_fn: transferFn });
                    }}
                  />
                </label>
                <label>
                  <span>Function</span>
                  <select
                    value={transferFn}
                    onChange={(e) => {
                      const next = e.target.value as TransferFn;
                      console.log("Store Updated: transferFn", next);
                      sendCommand({ transfer_time: transferTime, transfer_fn: next });
                    }}
                  >
                    <option value="IMMEDIATE">Immediate</option>
                    <option value="LINEAR">Linear</option>
                    <option value="SIGMOID">Sigmoid</option>
                    <option value="EXPONENTIAL">Exponential</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="control-card">
              <h3>Heart Rate</h3>
              <p className="control-help">Slider instantly updates target HR over transfer time.</p>
              <div className="control-row">
                <input type="range" min={0} max={300} value={heartRate} onChange={(e) => handleHRChange(Number(e.target.value))} />
                <input type="number" min={0} max={300} value={heartRate} onChange={(e) => handleHRChange(Number(e.target.value))} />
                <span className="val-badge">{heartRate} bpm</span>
              </div>
            </div>

            <div className="control-card">
              <h3>Cardiac Rhythm</h3>
              <p className="control-help">Select rhythm to instantly override the engine.</p>
              <select className="rhythm-select" value={rhythm} onChange={(e) => handleRhythmChange(e.target.value as RhythmType)}>
                {RHYTHM_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.rhythms.map((r) => (
                      <option key={r} value={r}>{RHYTHM_LABELS[r]}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="control-card">
              <h3>ST Segment (Ischemia/Infarct)</h3>
              <p className="control-help">Instantly shapes the ST segment relative to baseline.</p>
              <div className="control-row">
                <label>
                  <span>Elevation</span>
                  <input type="range" min={-2} max={5} step={0.1} value={stElev} onChange={(e) => handleSTChange(Number(e.target.value), stDepr)} />
                  <span className="val-badge">{stElev.toFixed(1)} mV</span>
                </label>
                <label>
                  <span>Depression</span>
                  <input type="range" min={-2} max={5} step={0.1} value={stDepr} onChange={(e) => handleSTChange(stElev, Number(e.target.value))} />
                  <span className="val-badge">{stDepr.toFixed(1)} mV</span>
                </label>
              </div>
            </div>

            <div className="control-card">
              <h3>Noise & Artifacts</h3>
              <p className="control-help">Injects electrical interference or patient motion.</p>
              <div className="control-row">
                <label>
                  <span>Noise Type</span>
                  <select value={artifactType} onChange={(e) => handleArtifactChange(artifactLevel, e.target.value as ArtifactType)}>
                    <option value="NONE">None</option>
                    <option value="BASELINE">Baseline Wander</option>
                    <option value="POWERLINE_50">50Hz Powerline</option>
                    <option value="POWERLINE_60">60Hz Powerline</option>
                    <option value="MOTION">Motion Artifact</option>
                    <option value="EMG">Muscle Tremor</option>
                  </select>
                </label>
                <label>
                  <span>Intensity</span>
                  <input type="range" min={0} max={1} step={0.1} value={artifactLevel} onChange={(e) => handleArtifactChange(Number(e.target.value), artifactType)} />
                  <span className="val-badge">{Math.round(artifactLevel * 100)}%</span>
                </label>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  );
}
