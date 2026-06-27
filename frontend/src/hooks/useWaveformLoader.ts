import { useEffect } from "react";
import { useMonitorStore } from "@/store/monitorStore";
import type { PTBWaveformData } from "@/types/ecg";

const WAVEFORM_BASE_URL = "/waveforms/ptb";

export function useWaveformLoader(): void {
  const condition       = useMonitorStore((s) => s.condition);
  const setWaveformData = useMonitorStore((s) => s.setWaveformData);
  const setLoading    = useMonitorStore((s) => s.setLoading);
  const setError      = useMonitorStore((s) => s.setError);

  useEffect(() => {
    let cancelled = false;
    const url = `${WAVEFORM_BASE_URL}/${condition}.json`;

    setLoading(true);

    fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} — ${res.statusText}`);
        }
        return res.json() as Promise<PTBWaveformData>;
      })
      .then((data) => {
        if (cancelled) return;

        if (!data.leads || !data.leads["II"]) {
          throw new Error(`Waveform JSON for '${condition}' is missing Lead II.`);
        }

        setWaveformData(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(`Could not load '${condition}' waveform: ${message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [condition, setWaveformData, setLoading, setError]);
}
