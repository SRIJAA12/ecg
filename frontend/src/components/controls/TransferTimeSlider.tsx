/**
 * src/components/controls/TransferTimeSlider.tsx
 * ==============================================
 * Transfer time control slider.
 */

import { useMonitorStore } from "@/store/monitorStore";
import "./controls.css";

const TRANSFER_TIME_MIN = 0;
const TRANSFER_TIME_MAX = 30;

export default function TransferTimeSlider() {
  const transferTime  = useMonitorStore((s) => s.transferTime);
  const setTransferTime = useMonitorStore((s) => s.setTransferTime);

  return (
    <div className="control-group">
      <div className="control-label-row">
        <span className="label">Transfer Time</span>
        <span className="control-value font-mono">{transferTime} <span className="control-unit">sec</span></span>
      </div>

      <input
        id="transfer-time-slider"
        type="range"
        className="control-slider"
        min={TRANSFER_TIME_MIN}
        max={TRANSFER_TIME_MAX}
        step={0.5}
        value={transferTime}
        onChange={(e) => setTransferTime(Number(e.target.value))}
        aria-label={`Transfer time: ${transferTime} seconds`}
        aria-valuemin={TRANSFER_TIME_MIN}
        aria-valuemax={TRANSFER_TIME_MAX}
        aria-valuenow={transferTime}
      />

      {/* Min/max labels */}
      <div className="control-range-labels">
        <span>{TRANSFER_TIME_MIN}s</span>
        <span>{TRANSFER_TIME_MAX}s</span>
      </div>
    </div>
  );
}
