# CGM Dashboard — Desktop App

A cross-platform desktop application for analyzing Continuous Glucose Monitor (CGM) data.
Built with Electron — runs on macOS and Windows.

---

## Features

- **CSV Import** — drag & drop or open via File menu. Auto-detects Dexcom, FreeStyle Libre, Medtronic, and generic CSV exports
- **Overview Dashboard** — average glucose, time-in-range, variability (CV), estimated A1C
- **Glucose Trace** — interactive chart with target range bands, color-coded segments, time range filters
- **Daily Heatmap** — hourly average glucose heatmap and bar chart
- **Pattern Detection** — automatic analysis: TIR goal, hypo/hyperglycemia, dawn phenomenon, variability
- **AI Insights** — Claude-powered analysis of your data (requires Anthropic API key)
- **Settings** — configurable glucose thresholds, API key management

---

## Quick Start

### Requirements
- Node.js 18+ (https://nodejs.org)
- npm (included with Node.js)

### Run in Development

```bash
# 1. Install dependencies
npm install

# 2. Start the app
npm start
```

### Build for Distribution

```bash
# macOS (.dmg + .zip)
npm run build:mac

# Windows (.exe installer + portable)
npm run build:win

# Both platforms
npm run build:all
```

Built apps will appear in the `dist/` folder.

> **Note for Windows builds on macOS**: You may need `wine` installed via Homebrew.
> **Note for macOS builds on Windows**: Cross-compilation is limited; use a Mac or CI/CD.

---

## Setting Up AI Insights

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Open the app → click the key icon in the sidebar (or go to Settings)
3. Paste your key — it's stored locally in your OS user data directory

Alternatively, set the environment variable before running:
```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

---

## CSV Format

The app auto-detects columns. Supported column name patterns:

| Column Type | Detected patterns |
|-------------|------------------|
| Timestamp   | `time`, `date`, `timestamp` |
| Glucose     | `glucose`, `mg/dL`, `EGV`, `mmol` |

Glucose values can be in **mg/dL** or **mmol/L** — the app converts automatically.

### Example CSV structure:
```csv
Timestamp,Glucose Value (mg/dL),...)
2024-01-15 08:00,112,...
2024-01-15 08:05,115,...
```

---

## App Data Location

- **macOS**: `~/Library/Application Support/cgm-dashboard/config.json`
- **Windows**: `%APPDATA%\cgm-dashboard\config.json`

---

## Disclaimer

This application is for informational purposes only and is not a medical device.
Always consult your healthcare provider for medical decisions.
