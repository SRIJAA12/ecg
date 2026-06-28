/**
 * src/components/controls/TransferFunctionSelect.tsx
 * =================================================
 * Transfer function mode selector (Immediate, Linear, Exponential).
 */

import { useMonitorStore } from "@/store/monitorStore";
import { TRANSFER_MODE_LABELS, type TransferMode } from "@/types/ecg";
import "./controls.css";

export default function TransferFunctionSelect() {
  const transferMode  = useMonitorStore((s) => s.transferMode);
  const setTransferMode = useMonitorStore((s) => s.setTransferMode);

  return (
    <div className="control-group">
      <div className="control-label-row">
        <span className="label">Transfer Function</span>
      </div>

      <div className="select-wrapper">
        <select
          id="transfer-function-select"
          className="control-select"
          value={transferMode}
          onChange={(e) => setTransferMode(e.target.value as TransferMode)}
          aria-label="Select transfer function mode"
        >
          {(Object.keys(TRANSFER_MODE_LABELS) as TransferMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {TRANSFER_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
