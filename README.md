# CGM Dashboard — Desktop App

A cross-platform desktop application for analyzing Continuous Glucose Monitor (CGM) data.
Built with Electron — runs on macOS and Windows.

---

## Features

- **Multi-profile support** — separate data, preferences and API keys per user
- **CSV Import** — drag & drop or open via File menu. Auto-detects format
- **4 supported formats** — LingoFormat (Lingo/Abbott), LibreViewFormat (FreeStyle Libre), DexcomFormat, GenericFormat
- **Overview Dashboard** — average glucose, GMI (est. A1C), time-in-range, variability (CV)
- **Glucose Trace** — interactive chart with target range bands, time range + resolution filters
- **Daily Time in Range** — line chart showing % in/above/below range per day, toggleable series
- **Daily Heatmap** — hourly average glucose heatmap + bar chart, filterable by date range
- **Pattern Detection** — TIR goal, hypo/hyperglycemia, dawn phenomenon, variability
- **AI Insights** — Claude-powered analysis (requires Anthropic API key)
- **Persistent preferences** — all settings saved per profile, restored on next launch
- **Fully offline** — only AI Insights requires internet

---

## Project Structure

```
cgm-desktop/
├── main.js              # Electron main process — window, IPC, file system, profiles
├── preload.js           # Secure IPC bridge between main and renderer
├── package.json         # Dependencies and electron-builder config
│
└── src/
    ├── index.html       # App shell — loads CSS/JS, contains all HTML markup
    │
    ├── css/
    │   ├── variables.css    # Design tokens — colours, spacing, typography
    │   ├── components.css   # All UI components — sidebar, charts, buttons, heatmap
    │   └── profiles.css     # Profile picker screen and new-profile modal
    │
    └── js/
        ├── state.js         # Global state variables + resampleData()
        ├── profiles.js      # Profile picker, create, switch, delete
        ├── fileLibrary.js   # File list, select and delete uploaded CSVs
        ├── prefs.js         # savePrefs(), applyPrefsToUI()
        ├── parser.js        # Multi-format CSV parser and format detection
        ├── dashboard.js     # Stats, glucose chart, patterns, TIR, heatmap
        ├── ai.js            # AI analysis and API key management
        └── init.js          # init(), navigateTo(), loadDemo() — entry point
```

Script load order in index.html is intentional: state.js first (defines globals),
feature modules in dependency order, init.js last (calls init() to boot the app).

---

## Quick Start

### Requirements
- Node.js 18+ (https://nodejs.org)

### Run in Development

```bash
npm install
npm start
```

### Build for Distribution

```bash
npm run build:mac    # macOS (.dmg + .zip)
npm run build:win    # Windows (.exe installer + portable)
npm run build:all    # Both (macOS only, requires Wine for Windows target)
```

Built apps appear in the dist/ folder.

---

## Profile Data Storage

Each profile gets its own isolated directory:

  macOS:   ~/Library/Application Support/cgm-dashboard/profiles/<id>/
  Windows: %APPDATA%\cgm-dashboard\profiles\<id>\

Each contains:
  preferences.json   — chart settings, thresholds, API key
  uploads/           — CSV files for this profile

Global files at the root of cgm-dashboard/:
  profiles.json      — list of all profiles
  global.json        — last used profile id

---

## Setting Up AI Insights

1. Get an API key from console.anthropic.com
2. In the app: click the key icon in the sidebar or go to Settings
3. The key is saved to your profile's preferences.json

Or set before running: ANTHROPIC_API_KEY=sk-ant-... npm start

---

## Supported CSV Formats

Format           Detected by                              Notes
LingoFormat      "Time of Glucose Reading" column         Lingo / Abbott CGM
LibreViewFormat  "Device Timestamp" + "Record Type"       FreeStyle Libre via libreview.com
DexcomFormat     "Glucose Value (mg/dL)" or "EGV"         Dexcom Clarity exports
GenericFormat    Fallback                                  Any CSV with timestamp + glucose

Both mg/dL and mmol/L supported — mmol/L converted automatically.

---

## Disclaimer

This application is for informational purposes only and is not a medical device.
Always consult your healthcare provider for medical decisions.
