// src/pages/InstructorConsole.tsx
// Instructor control interface — all controls send commands via WebSocket.

import { useState } from "react";
import { useECGStore } from "../store/ecgStore";
import { connect, disconnect } from "../engine/wsClient";
import { useEffect } from "react";
import {
  RHYTHM_GROUPS, RHYTHM_LABELS, RHYTHM_INTELLIGENCE, ALL_LEADS,
  type RhythmType, type ArtifactType, type TransferFn
} from "../types/ecgState";
import ECGAnalysisPanel from "../components/monitor/ECGAnalysisPanel";
import "./InstructorConsole.css";

export default function InstructorConsole() {
  const ecgState    = useECGStore((s) => s.ecgState);
  const heartRate   = useECGStore((s) => s.heartRate);
  const liveHeartRate = useECGStore((s) => s.liveHeartRate);
  const severity    = useECGStore((s) => s.severity);
  const connected   = useECGStore((s) => s.connected);
  const sendCommand = useECGStore((s) => s.sendCommand);
  const hrTrend     = useECGStore((s) => s.hrTrend);

  // Local form state
  const transferTime = useECGStore((s) => s.transferTime);
  const transferFn = useECGStore((s) => s.transferFn);
  const [stElev,        setStElev]        = useState(0);
  const [stDepr,        setStDepr]        = useState(0);
  const [ectopyRate,    setEctopyRate]    = useState(0);
  const [artifactLevel, setArtifactLevel] = useState(0);
  const [artifactType,  setArtifactType]  = useState<ArtifactType>("NONE");

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  // Sync local state from backend snapshot
  useEffect(() => {
    if (!ecgState) return;
    setStElev(ecgState.st_elevation);
    setStDepr(ecgState.st_depression);
    setEctopyRate(ecgState.ectopy_rate);
    setArtifactLevel(ecgState.artifact_level);
    setArtifactType(ecgState.artifact_type);
  }, [ecgState?.session_id]);

  const rhythm = useECGStore((s) => s.rhythm) as RhythmType;
  const rhythmProfile = useECGStore((s) => s.rhythmIntelligence);

  // Rhythm-aware HR limits
  const hrMin = rhythmProfile?.hrMin ?? 0;
  const hrMax = rhythmProfile?.hrMax === 0 ? 0 : (rhythmProfile?.hrMax ?? 300);
  const hrSliderMax = hrMax === 0 ? 0 : (hrMax > 0 ? hrMax : 300);

  const applyRhythm = (r: RhythmType) => {
    const profile = RHYTHM_INTELLIGENCE[r];
    const update: Parameters<typeof sendCommand>[0] = {
      rhythm: r,
      transfer_time: transferTime,
      transfer_fn: transferFn,
    };
    // If current HR is outside the new rhythm's range, also set the default HR
    if (profile) {
      const curHR = heartRate;
      if (profile.hrMax === 0) {
        update.heart_rate = 0;
      } else if (curHR < profile.hrMin || curHR > profile.hrMax) {
        update.heart_rate = profile.defaultHr;
      }
    }
    sendCommand(update);
  };

  const applyST = () => {
    sendCommand({ st_elevation: stElev, st_depression: stDepr, transfer_time: transferTime, transfer_fn: transferFn });
  };

  const applyEctopy = () => {
    sendCommand({ ectopy_rate: ectopyRate });
  };

  const applyArtifact = () => {
    sendCommand({ artifact_level: artifactLevel, artifact_type: artifactType });
  };

  return (
    <div className="console-page">
      {/* Sidebar */}
      <aside className="console-sidebar">
        <div className="console-brand">
          <span>🫀</span>
          <div>
            <div className="console-brand__title">SimMan ECG</div>
            <div className="console-brand__sub">Instructor Console</div>
          </div>
        </div>

        <div className={`console-status console-status--${connected ? "on" : "off"}`}>
          <span className="console-status__dot" />
          {connected ? "ENGINE LIVE" : "DISCONNECTED"}
        </div>

        <div className="console-live">
          <div className="console-live__label">LIVE HR</div>
          <div className={`console-live__value console-live__value--${severity}`}>{liveHeartRate}</div>
          <div className="console-live__unit">bpm</div>
          <div className="console-live__rhythm">{RHYTHM_LABELS[rhythm as RhythmType] ?? rhythm}</div>
          <div className={`badge badge--${severity}`}>{severity.toUpperCase()}</div>
        </div>

        {/* HR Trend sparkline */}
        <div className="console-sparkline">
          <div className="console-section-label">HR TREND</div>
          <SparkLine values={hrTrend} />
        </div>

        {/* ECG Intelligence Panel */}
        <ECGAnalysisPanel />

        <a href="/" className="console-monitor-btn">← Patient Monitor</a>
      </aside>

      {/* Main panel */}
      <main className="console-main">

        {/* Transfer controls — always visible */}
        <section className="console-card console-card--transfer">
          <div className="console-card__title">TRANSFER ENGINE</div>
          <div className="console-transfer-row">
            <label>
              <span>Time (s)</span>
              <input type="number" min={0} max={300} value={transferTime}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  sendCommand({ transfer_time: next, transfer_fn: transferFn });
                }} />
            </label>
            <label>
              <span>Function</span>
              <select value={transferFn} onChange={(e) => {
                const next = e.target.value as TransferFn;
                sendCommand({ transfer_time: transferTime, transfer_fn: next });
              }}>
                <option value="IMMEDIATE">Immediate</option>
                <option value="LINEAR">Linear</option>
                <option value="SIGMOID">Sigmoid</option>
                <option value="EXPONENTIAL">Exponential</option>
              </select>
            </label>
          </div>
        </section>

        {/* Rhythm selector */}
        <section className="console-card">
          <div className="console-card__title">BASIC RHYTHM</div>
          <div className="rhythm-groups">
            {RHYTHM_GROUPS.map((group) => (
              <div key={group.label} className="rhythm-group">
                <div className="rhythm-group__label">{group.label}</div>
                <div className="rhythm-group__btns">
                  {group.rhythms.map((r) => (
                    <button
                      key={r}
                      className={`rhythm-btn ${r === rhythm ? "rhythm-btn--active" : ""}`}
                      onClick={() => applyRhythm(r)}
                    >
                      {RHYTHM_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="console-row">
          {/* Heart Rate */}
          <section className="console-card console-card--half">
            <div className="console-card__title">HEART RATE</div>
            <div className="hr-control">
              {rhythmProfile && (
                <div className="hr-range-hint">
                  Allowed: {hrMax === 0 ? "0" : `${hrMin}–${hrSliderMax}`} bpm
                  {" "}<span className="hr-range-default">↳ Default: {rhythmProfile.defaultHr}</span>
                </div>
              )}
              <input
                type="range"
                min={hrMin}
                max={hrSliderMax || 1}
                value={Math.min(Math.max(heartRate, hrMin), hrSliderMax || 0)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  sendCommand({ heart_rate: next, transfer_time: transferTime, transfer_fn: transferFn });
                }}
                className="hr-slider"
                disabled={hrMax === 0}
              />
              <div className="hr-display">
                <input
                  type="number"
                  min={hrMin}
                  max={hrSliderMax || 0}
                  value={heartRate}
                  onChange={(e) => {
                    const next = Math.min(Math.max(Number(e.target.value), hrMin), hrSliderMax || 0);
                    sendCommand({ heart_rate: next, transfer_time: transferTime, transfer_fn: transferFn });
                  }}
                  className="hr-input"
                  disabled={hrMax === 0}
                />
                <span className="hr-unit">BPM</span>
              </div>
            </div>
          </section>

          {/* ST Changes */}
          <section className="console-card console-card--half">
            <div className="console-card__title">ST SEGMENT</div>
            <div className="st-controls">
              <label>
                <span>ST Elevation (mV)</span>
                <input type="range" min={-2} max={5} step={0.05} value={stElev}
                  onChange={(e) => setStElev(Number(e.target.value))} />
                <span className="st-value">{stElev.toFixed(2)} mV</span>
              </label>
              <label>
                <span>ST Depression (mV)</span>
                <input type="range" min={-2} max={5} step={0.05} value={stDepr}
                  onChange={(e) => setStDepr(Number(e.target.value))} />
                <span className="st-value">{stDepr.toFixed(2)} mV</span>
              </label>
              <button className="apply-btn" onClick={applyST}>Apply ST</button>
            </div>
          </section>
        </div>

        <div className="console-row">
          {/* Ectopy */}
          <section className="console-card console-card--half">
            <div className="console-card__title">ECTOPY</div>
            <label>
              <span>PVC/PAC Rate (per min)</span>
              <input type="range" min={0} max={60} value={ectopyRate}
                onChange={(e) => setEctopyRate(Number(e.target.value))} />
              <span className="st-value">{ectopyRate}/min</span>
            </label>
            <button className="apply-btn" onClick={applyEctopy}>Apply Ectopy</button>
          </section>

          {/* Artifacts */}
          <section className="console-card console-card--half">
            <div className="console-card__title">ARTIFACT / NOISE</div>
            <label>
              <span>Type</span>
              <select value={artifactType} onChange={(e) => setArtifactType(e.target.value as ArtifactType)}>
                <option value="NONE">None</option>
                <option value="BASELINE">Baseline Wander</option>
                <option value="POWERLINE_50">50 Hz Powerline</option>
                <option value="POWERLINE_60">60 Hz Powerline</option>
                <option value="MOTION">Motion Artifact</option>
                <option value="EMG">Muscle (EMG)</option>
              </select>
            </label>
            <label>
              <span>Level</span>
              <input type="range" min={0} max={1} step={0.05} value={artifactLevel}
                onChange={(e) => setArtifactLevel(Number(e.target.value))} />
              <span className="st-value">{Math.round(artifactLevel * 100)}%</span>
            </label>
            <button className="apply-btn" onClick={applyArtifact}>Apply Artifact</button>
          </section>
        </div>

        {/* Lead selector */}
        <section className="console-card">
          <div className="console-card__title">MONITOR LEAD</div>
          <div className="lead-btns">
            {ALL_LEADS.map((l) => (
              <button
                key={l}
                className={`lead-btn ${ecgState?.lead_selection === l ? "lead-btn--active" : ""}`}
                onClick={() => sendCommand({ lead_selection: l })}
              >{l}</button>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function SparkLine({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="sparkline-empty">Waiting for data...</div>;
  const min = Math.min(...values);
  const max = Math.max(...values) || min + 1;
  const w = 160, h = 40;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="sparkline">
      <polyline points={pts} fill="none" stroke="#00ff88" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
