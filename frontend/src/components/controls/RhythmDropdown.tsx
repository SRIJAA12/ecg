/**
 * src/components/controls/RhythmDropdown.tsx
 * ============================================
 * Rhythm selector with grouped optgroups matching the Laerdal interface.
 */

import { useMonitorStore } from "@/store/monitorStore";
import {
  RHYTHM_LABELS,
  RHYTHM_SEVERITY,
  RHYTHM_GROUPS,
  type ECGRhythm,
} from "@/types/ecg";
import "./controls.css";

const SEVERITY_BADGE: Record<string, string> = {
  normal:   "NSR",
  warning:  "WARN",
  critical: "CRIT",
};

export default function RhythmDropdown() {
  const rhythm    = useMonitorStore((s) => s.rhythm);
  const setRhythm = useMonitorStore((s) => s.setRhythm);

  const severity = RHYTHM_SEVERITY[rhythm];

  return (
    <div className="control-group">
      <div className="control-label-row">
        <span className="label">Basic Rhythm</span>
        <span className={`badge badge--${severity}`}>
          {SEVERITY_BADGE[severity] ?? "NSR"}
        </span>
      </div>

      <div className="select-wrapper">
        <select
          id="rhythm-dropdown"
          className="control-select"
          value={rhythm}
          onChange={(e) => setRhythm(e.target.value as ECGRhythm)}
          aria-label="Select cardiac rhythm"
        >
          {RHYTHM_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.rhythms.map((r) => (
                <option key={r} value={r}>
                  {RHYTHM_LABELS[r]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
