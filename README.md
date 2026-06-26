# Healthcare Simulation Monitor

> A professional-grade physiological signal viewer built for clinical simulation environments.
> Developed as a hospital internship project — Phase 1: Real ECG Waveform Viewer.

---

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | ECG Viewer — MIT-BIH Real Waveforms | 🟡 In Progress |
| 2 | Complete Patient Monitor | ⬜ Planned |
| 3 | FastAPI Backend | ⬜ Planned |
| 4 | Database Integration | ⬜ Planned |
| 5 | AI Physiology Engine | ⬜ Planned |

---

## Architecture Overview

```
PhysioNet (MIT-BIH Database)
        │
        ▼
scripts/download_dataset.py      ← Downloads ECG records once
        │
        ▼
datasets/mit-bih/                ← Raw PhysioNet files (not committed to Git)
        │
        ▼
converter/                       ← Python: reads, extracts, normalizes ECG
        │
        ▼
waveform-library/                ← JSON waveform files (generated output)
        │
        ▼
frontend/public/waveforms/ecg/   ← Copied JSON served by Vite
        │
        ▼
React + HTML5 Canvas             ← Renders & animates ECG continuously
```

---

## Tech Stack

### Frontend
| Tool | Purpose |
|------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool / Dev server |
| HTML5 Canvas | ECG waveform rendering |
| Zustand | Global state management |
| React Icons | UI icon library |

### Python (Signal Processing)
| Library | Purpose |
|---------|---------|
| wfdb | Read PhysioNet/MIT-BIH records |
| numpy | Signal array operations |
| scipy | Signal filtering & processing |
| pandas | Data manipulation |
| matplotlib | Debug signal plotting |

---

## Folder Structure

```
HealthcareSimulationMonitor/
│
├── frontend/                   # React application (Vite + TypeScript)
│   ├── public/
│   │   └── waveforms/ecg/      # JSON waveforms served statically
│   └── src/
│       ├── components/         # Reusable UI components
│       ├── hooks/              # Custom React hooks
│       ├── pages/              # Page-level components
│       ├── services/           # API / data loading services
│       ├── store/              # Zustand state stores
│       ├── styles/             # Global CSS
│       ├── types/              # TypeScript interfaces & types
│       └── utils/              # Pure utility functions
│
├── converter/                  # Python ECG processing pipeline
│   ├── extract.py              # Extract individual heartbeats
│   ├── normalize.py            # Normalize signal amplitude
│   ├── export.py               # Export to JSON format
│   └── utils.py                # Shared helpers
│
├── datasets/                   # Raw downloaded PhysioNet data (git-ignored)
│   └── mit-bih/
│
├── waveform-library/           # Generated JSON waveforms (git-ignored)
│
├── docs/                       # Developer documentation
│
├── scripts/
│   └── download_dataset.py     # Automatic PhysioNet downloader
│
├── requirements.txt            # Python dependencies
├── .gitignore
└── README.md
```

---

## Quick Start

### Step 1 — Install Python dependencies
```bash
pip install -r requirements.txt
```

### Step 2 — Download ECG dataset (first time only)
```bash
python scripts/download_dataset.py
```
This downloads required MIT-BIH records from PhysioNet into `datasets/mit-bih/`.
Subsequent runs skip already-downloaded files.

### Step 3 — Run ECG converter
```bash
python converter/convert.py
```
This reads raw ECG data and exports JSON waveforms to `waveform-library/`.

### Step 4 — Start the React frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

---

## ECG Rhythms Supported (Phase 1)

| Rhythm | MIT-BIH Record | Description |
|--------|---------------|-------------|
| Sinus (Normal) | 100 | Normal sinus rhythm |
| PVC | 119 | Premature Ventricular Contraction |
| VT | 207 | Ventricular Tachycardia |
| VF | 208 | Ventricular Fibrillation |
| AFib | 202 | Atrial Fibrillation |

---

## Data Source

**MIT-BIH Arrhythmia Database**
- Moody GB, Mark RG. The impact of the MIT-BIH Arrhythmia Database. *IEEE Eng in Med and Biol* 20(3):45-50 (May-June 2001).
- PhysioNet: https://physionet.org/content/mitdb/1.0.0/

---

## License

This project is for educational and clinical simulation purposes only.
MIT-BIH dataset is used under PhysioNet's Open Data Commons Attribution License.

---

*Built with ❤️ as a hospital internship project.*
