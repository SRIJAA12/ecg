/**
 * src/App.tsx
 * ===========
 * Root application component.
 *
 * Current state (Phase 1 scaffold):
 *   Renders a professional "system ready" screen that verifies:
 *   - React is mounted
 *   - CSS design system is loaded
 *   - Zustand store is accessible
 *   - Fonts are loaded
 *
 * This will be replaced in Module 5 with the full MonitorPage layout.
 */

import { useMonitorStore } from "@/store/monitorStore";
import { RHYTHM_LABELS } from "@/types/ecg";

/**
 * App
 * ───
 * Single-page application root.
 * In Phase 1, this directly renders the monitor layout.
 * In Phase 2+, this will contain a router (<Routes>, <Route>).
 */
export default function App() {
  // Read state from the Zustand store to verify it's connected
  const heartRate = useMonitorStore((s) => s.heartRate);
  const rhythm = useMonitorStore((s) => s.rhythm);
  const setHeartRate = useMonitorStore((s) => s.setHeartRate);
  const setRhythm = useMonitorStore((s) => s.setRhythm);

  return (
    <div style={styles.page}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.pulse}>●</span>
          <h1 style={styles.title}>Healthcare Simulation Monitor</h1>
        </div>
        <div style={styles.badge}>Phase 1 — ECG Viewer</div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main style={styles.main}>
        {/* Status card */}
        <div className="monitor-card fade-in" style={styles.card}>
          <p className="label" style={{ marginBottom: "var(--space-4)" }}>
            System Status
          </p>

          <div style={styles.statusGrid}>
            <StatusRow label="React" value="19 ✓" />
            <StatusRow label="TypeScript" value="5.7 ✓" />
            <StatusRow label="Zustand Store" value="Connected ✓" />
            <StatusRow label="Design System" value="Loaded ✓" />
            <StatusRow label="Fonts" value="Inter + JetBrains Mono ✓" />
          </div>
        </div>

        {/* Store verification card */}
        <div className="monitor-card fade-in" style={styles.card}>
          <p className="label" style={{ marginBottom: "var(--space-4)" }}>
            Zustand Store — Live State
          </p>

          <div style={styles.storeDemo}>
            {/* Heart Rate control */}
            <div>
              <p className="label" style={{ marginBottom: "var(--space-2)" }}>
                Heart Rate: <span style={styles.accentValue}>{heartRate} bpm</span>
              </p>
              <input
                type="range"
                className="control-slider"
                min={20}
                max={300}
                value={heartRate}
                onChange={(e) => setHeartRate(Number(e.target.value))}
                aria-label="Heart rate control"
              />
            </div>

            {/* Rhythm selector */}
            <div>
              <p className="label" style={{ marginBottom: "var(--space-2)" }}>
                Rhythm
              </p>
              <select
                className="control-select"
                value={rhythm}
                onChange={(e) =>
                  setRhythm(e.target.value as typeof rhythm)
                }
                aria-label="Rhythm selector"
              >
                {(Object.entries(RHYTHM_LABELS) as [typeof rhythm, string][]).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Live state display */}
            <div style={styles.stateDisplay}>
              <code style={styles.code}>
                {JSON.stringify({ heartRate, rhythm }, null, 2)}
              </code>
            </div>
          </div>
        </div>

        {/* Next step hint */}
        <div className="monitor-card fade-in" style={{ ...styles.card, borderColor: "rgba(0, 230, 118, 0.2)" }}>
          <p className="label" style={{ color: "var(--color-status-normal)", marginBottom: "var(--space-2)" }}>
            ✓ Module 4 Complete
          </p>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-base)" }}>
            Next: Module 5 — ECG Canvas Renderer & Waveform Animation
          </p>
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.statusRow}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--color-status-normal)", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>
        {value}
      </span>
    </div>
  );
}

// =============================================================================
// INLINE STYLES
// =============================================================================
// We use inline styles here ONLY because this is a temporary placeholder.
// All real components will use CSS classes from index.css.

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    backgroundColor: "var(--color-bg-base)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--space-4) var(--space-8)",
    borderBottom: "1px solid var(--color-bg-border)",
    backgroundColor: "var(--color-bg-panel)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
  },
  pulse: {
    color: "var(--color-status-normal)",
    fontSize: "0.6rem",
    animation: "blink 1.2s ease-in-out infinite",
  },
  title: {
    fontSize: "var(--text-lg)",
    fontWeight: "var(--weight-semibold)",
    color: "var(--color-text-primary)",
    letterSpacing: "-0.01em",
  },
  badge: {
    fontSize: "var(--text-xs)",
    fontWeight: "var(--weight-semibold)",
    color: "var(--color-text-muted)",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    border: "1px solid var(--color-bg-border)",
    borderRadius: "var(--radius-sm)",
    padding: "2px 8px",
  },
  main: {
    flex: 1,
    padding: "var(--space-8)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--space-6)",
    maxWidth: "680px",
    margin: "0 auto",
    width: "100%",
  },
  card: {
    width: "100%",
  },
  statusGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--space-2)",
  },
  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "var(--space-2) 0",
    borderBottom: "1px solid var(--color-bg-border)",
    fontSize: "var(--text-base)",
  },
  storeDemo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--space-4)",
  },
  accentValue: {
    color: "var(--color-text-accent)",
    fontFamily: "var(--font-mono)",
    fontWeight: "var(--weight-bold)",
  },
  stateDisplay: {
    background: "var(--color-bg-elevated)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-3) var(--space-4)",
    marginTop: "var(--space-2)",
  },
  code: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-sm)",
    color: "var(--color-ecg-sinus)",
    whiteSpace: "pre" as const,
  },
};
