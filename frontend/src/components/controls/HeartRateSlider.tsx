/**
 * src/components/controls/HeartRateSlider.tsx
 * ============================================
 * Heart rate control slider.
 * Single responsibility: display current HR and allow the user to change it.
 */

import { useMonitorStore } from "@/store/monitorStore";
import { HR_MIN, HR_MAX } from "@/types/ecg";
import "./controls.css";

export default function HeartRateSlider() {
  const heartRate    = useMonitorStore((s) => s.heartRate);
  const setHeartRate = useMonitorStore((s) => s.setHeartRate);

  return (
    <div className="control-group">
      <div className="control-label-row">
        <span className="label">Heart Rate</span>
        {/* Monospace font prevents layout shift as digits change */}
        <span className="control-value font-mono">{heartRate} <span className="control-unit">BPM</span></span>
      </div>

      <input
        id="heart-rate-slider"
        type="range"
        className="control-slider"
        min={HR_MIN}
        max={HR_MAX}
        step={1}
        value={heartRate}
        onChange={(e) => setHeartRate(Number(e.target.value))}
        aria-label={`Heart rate: ${heartRate} beats per minute`}
        aria-valuemin={HR_MIN}
        aria-valuemax={HR_MAX}
        aria-valuenow={heartRate}
      />

      {/* Min/max labels */}
      <div className="control-range-labels">
        <span>{HR_MIN}</span>
        <span>{HR_MAX}</span>
      </div>
    </div>
  );
}
