/**
 * src/components/monitor/ControlPanel.tsx
 * =========================================
 * Groups the HR slider, rhythm dropdown, and transfer controls into a single panel.
 * Purely a layout component — delegates to child controls.
 */

import HeartRateSlider from "@/components/controls/HeartRateSlider";
import RhythmDropdown from "@/components/controls/RhythmDropdown";
import TransferFunctionSelect from "@/components/controls/TransferFunctionSelect";
import TransferTimeSlider from "@/components/controls/TransferTimeSlider";
import "./ControlPanel.css";

export default function ControlPanel() {
  return (
    <section className="control-panel monitor-card" aria-label="Monitor controls">
      <HeartRateSlider />
      <div className="control-panel__divider" aria-hidden="true" />
      <RhythmDropdown />
      <div className="control-panel__divider" aria-hidden="true" />
      <TransferFunctionSelect />
      <div className="control-panel__divider" aria-hidden="true" />
      <TransferTimeSlider />
    </section>
  );
}
