"""Accuracy and regression tests for the real-time mathematical ECG engine.

The HealthcareSimulationMonitor JSON files are read only for reference metadata
and qualitative validation. No runtime code imports or replays those samples.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
WORKSPACE = BACKEND.parents[1]
sys.path.insert(0, str(BACKEND))

from engine.transfer_engine import TransferEngine
from engine.waveform_generator import WaveformGenerator, get_beat_params
from models.ecg_state import ECGState, ECGStateUpdate, RhythmType, TransferFn


class ECGAccuracyTests(unittest.TestCase):
    def test_hr_zero_is_supported_and_continuously_flat(self) -> None:
        state = ECGState(heart_rate=0, rhythm=RhythmType.NSR)
        generator = WaveformGenerator()
        self.assertTrue(np.isinf(generator._rr(state)))
        for _ in range(200):
            self.assertFalse(np.any(generator.generate(state, 26)))
        ECGStateUpdate(heart_rate=0)
        with self.assertRaises(ValueError):
            ECGStateUpdate(heart_rate=-1)

    def test_rr_uses_current_hr(self) -> None:
        generator = WaveformGenerator()
        for hr, expected in ((40, 1.5), (60, 1.0), (120, 0.5), (180, 1 / 3)):
            state = ECGState(heart_rate=hr, hrv_std=0)
            self.assertAlmostEqual(generator._rr(state, RhythmType.NSR), expected)

    def test_required_morphologies_are_distinct(self) -> None:
        rhythms = (
            RhythmType.NSR, RhythmType.SINUS_BRADY, RhythmType.SINUS_TACHY,
            RhythmType.AFIB, RhythmType.PVC, RhythmType.VT, RhythmType.VF,
            RhythmType.ASYSTOLE, RhythmType.PEA, RhythmType.LBBB,
            RhythmType.RBBB, RhythmType.ANT_STEMI,
        )
        signatures = {}
        np.random.seed(7)
        for rhythm in rhythms:
            state = ECGState(heart_rate=80, hrv_std=0, rhythm=rhythm)
            if rhythm == RhythmType.ANT_STEMI:
                state.st_elevation = 0.3
            signal = WaveformGenerator().generate(state, 4096)
            signatures[rhythm] = np.round(signal, 4).tobytes()
        self.assertEqual(len(set(signatures.values())), len(rhythms))

    def test_clinical_morphology_invariants(self) -> None:
        state = ECGState(heart_rate=80, hrv_std=0)
        nsr = get_beat_params(state, RhythmType.NSR)
        afib = get_beat_params(state, RhythmType.AFIB)
        pvc = get_beat_params(state, RhythmType.PVC)
        vt = get_beat_params(state, RhythmType.VT)
        lbbb = get_beat_params(state, RhythmType.LBBB)
        rbbb = get_beat_params(state, RhythmType.RBBB)
        self.assertIsNotNone(nsr.p)
        self.assertIsNone(afib.p)
        self.assertIsNone(pvc.p)
        self.assertIsNone(vt.p)
        self.assertGreater(pvc.qrs_extra_width, nsr.qrs_extra_width)
        self.assertGreater(vt.qrs_extra_width, nsr.qrs_extra_width)
        self.assertGreater(lbbb.qrs_extra_width, nsr.qrs_extra_width)
        self.assertGreater(rbbb.qrs_extra_width, nsr.qrs_extra_width)

    def test_transfer_functions_and_durations(self) -> None:
        immediate = TransferEngine()
        immediate.begin("heart_rate", 60, 120, 10.0, TransferFn.IMMEDIATE)
        self.assertEqual(immediate.tick("heart_rate", 0.05), 120)
        self.assertFalse(immediate.is_active("heart_rate"))

        midpoints = {}
        for fn in (TransferFn.LINEAR, TransferFn.EXPONENTIAL, TransferFn.SIGMOID):
            engine = TransferEngine()
            engine.begin("heart_rate", 60, 120, 1.0, fn)
            values = [engine.tick("heart_rate", 0.05) for _ in range(20)]
            midpoints[fn] = values[9]
            self.assertEqual(values[-1], 120)
        self.assertGreater(midpoints[TransferFn.EXPONENTIAL], midpoints[TransferFn.LINEAR])
        self.assertAlmostEqual(
            midpoints[TransferFn.SIGMOID], midpoints[TransferFn.LINEAR], places=5
        )

        slow = TransferEngine()
        slow.begin("heart_rate", 60, 120, 10.0, TransferFn.LINEAR)
        for _ in range(20):
            value = slow.tick("heart_rate", 0.05)
        self.assertAlmostEqual(value, 66.0)
        self.assertTrue(slow.is_active("heart_rate"))

    def test_sustained_packet_generation_stays_finite_and_continuous(self) -> None:
        """Exercise ten simulated minutes using the production packet size."""
        generator = WaveformGenerator()
        state = ECGState(heart_rate=180, rhythm=RhythmType.AFIB)
        previous = None
        largest_boundary_jump = 0.0
        for _ in range(12_000):
            packet = generator.generate(state, 26)
            self.assertTrue(np.isfinite(packet).all())
            if previous is not None:
                largest_boundary_jump = max(
                    largest_boundary_jump, abs(float(packet[0] - previous))
                )
            previous = packet[-1]
        self.assertLess(largest_boundary_jump, 1.5)

    def test_reference_datasets_are_validation_only(self) -> None:
        reference_dir = (
            WORKSPACE / "HealthcareSimulationMonitor" / "frontend"
            / "public" / "waveforms" / "ecg"
        )
        expected = {
            "sinus.json": "Normal Sinus Rhythm",
            "afib.json": "Atrial Fibrillation",
            "pvc.json": "PVC",
            "vt.json": "Ventricular Tachycardia",
            "vf.json": "Ventricular Fibrillation",
        }
        for filename, description in expected.items():
            with (reference_dir / filename).open(encoding="utf-8") as stream:
                metadata = json.load(stream)
            self.assertIn(description, metadata["description"])
            self.assertEqual(metadata["sample_rate"], 360)
            self.assertGreater(metadata["num_samples"], 0)

        generator_source = (BACKEND / "engine" / "waveform_generator.py").read_text()
        self.assertNotIn("waveforms/ecg", generator_source)
        self.assertNotIn(".json", generator_source)


if __name__ == "__main__":
    unittest.main()
