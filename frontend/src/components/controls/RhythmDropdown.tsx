/**
 * src/components/controls/RhythmDropdown.tsx
 * ============================================
 * Condition selector with grouped optgroups matching the Laerdal interface.
 */

import { useMonitorStore } from "@/store/monitorStore";
import {
  CONDITION_LABELS,
  CONDITION_SEVERITY,
  CONDITION_GROUPS,
  type PTBCondition,
} from "@/types/ecg";
import "./controls.css";

const SEVERITY_BADGE: Record<string, string> = {
  normal:   "NSR",
  warning:  "WARN",
  critical: "CRIT",
};

export default function RhythmDropdown() {
  const condition    = useMonitorStore((s) => s.condition);
  const setCondition = useMonitorStore((s) => s.setCondition);
  const isLoading    = useMonitorStore((s) => s.isLoading);

  const severity = CONDITION_SEVERITY[condition];

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
          value={condition}
          disabled={isLoading}
          onChange={(e) => setCondition(e.target.value as PTBCondition)}
          aria-label="Select cardiac condition"
        >
          {CONDITION_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.conditions.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
