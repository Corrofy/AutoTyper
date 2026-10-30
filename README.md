# AutoTyper Pro — Cross-Browser Extension & Web Simulator

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8.svg)](https://tailwindcss.com/)

> **AutoTyper Pro** automatically types pasted snippets and clipboard text with realistic keystrokes, authentic timing jitter, anti-paste bypass heuristics, mechanical keyboard sound synthesis, an in-page command palette, and customizable keyboard shortcuts. Compatible with **Google Chrome**, **Microsoft Edge**, **Brave**, **Opera**, and **Mozilla Firefox**.

---

## 📖 Quick Links

- [📋 Architecture & Future Roadmap](docs/summary.md) — System design summary, data flow, and roadmap for future addons.
- [🛠️ Build & Installation Guide](docs/build-instructions.md) — Step-by-step instructions for building, packaging, and loading extensions.
- [🤝 Contributing Guidelines](docs/contributing.md) — Architecture breakdown, coding standards, and PR checklist.
- [📝 Audit & Fixes Log](docs/fixes.md) — Complete record of audit findings, bugs fixed, and architectural hardening.

---

## ✨ Key Features

### 1. ⌨️ Authentic Human Typing Simulation
- **WPM & Cadence Control**: Select from speed presets (*Human 75 WPM*, *Steady*, *Turbo*, or *Custom*) with adjustable target WPM and base delays.
- **Natural Jitter**: Applies configurable Gaussian variance between consecutive keystrokes so typing feels organic.
- **Punctuation & Boundary Pacing**: Automatically pauses at sentence boundaries (`.`, `!`, `?`, `;`, newlines) and word spaces to mirror natural human cadence.

### 2. 🛡️ Anti-Paste Bypass Heuristics
- Many proctored testing portals, corporate hiring platforms, and financial forms block pasting via:
  ```html
  <input onpaste="return false;" />
  ```
- AutoTyper Pro bypasses this restriction by generating authentic browser `KeyboardEvent`s (`keydown`, `keypress`, `keyup`) alongside native `beforeinput` and `input` events for every character.
- Online editors (including **Monaco Editor / OneCompiler**, **CodeMirror**, and **Quill**) receive genuine keystrokes with strictly isolated modifier flags, preventing accidental trigger of editor commands like `Ctrl+F` or `Ctrl+P`.

### 3. 🎯 Mistake Modes & Manual Typo Override
- **Manual Override Mode (Recommended)**: Keeps typing 100% clean by default, but allows on-demand mistakes anytime:
  - **Keyboard Shortcut**: Press **`Alt + M`** during active typing.
  - **Floating HUD Button**: Click **`+Mistake`** on the bottom-right in-page floating HUD.
  - When triggered, the engine hits a realistic adjacent QWERTY key, pauses in human hesitation (~150ms), presses backspace to delete it, and resumes clean typing.
- **100% Flawless Mode**: Completely disables all typos and backspacing for mission-critical input.
- **Random Heuristic Mode**: Statistical typo injection with an adjustable frequency slider.

### 4. 🔍 In-Page Quick Snippet Command Palette (`Alt + K`)
- Press **`Alt + K`** on any webpage to bring up a sleek in-page command palette overlay.
- Quickly search snippets by title, tag, or trigger abbreviation.
- Navigate with `↑` / `↓` arrow keys and press `Enter` to auto-type directly into the active field.

### 5. 🗂️ Snippet Management & Dynamic Template Tags
- Manage an unlimited snippet library categorized by type (*Email*, *Code*, *Forms*, *Chat*, *Testing*, *Custom*).
- **Dynamic Template Variables**:
  - `{{date}}` — Current locale date (e.g. `10/30/2026`)
  - `{{time}}` — Current locale time (e.g. `1:15 PM`)
  - `{{weekday}}` — Day of week (e.g. `Friday`)
  - `{{month}}` — Current month (e.g. `October`)
  - `{{year}}` — Current year (e.g. `2026`)
  - `{{timestamp}}` — ISO 8601 timestamp
  - `{{name}}` — Contact name
  - `{{email}}` — Contact email
  - `{{ticket_id}}` — Random ticket/incident identifier
- **Abbreviation Triggers**: Type `:sig`, `:meeting`, or any custom prefix followed by `Tab`, `Space`, or `Enter` to expand in place.
- **Per-Snippet Shortcuts**: Assign direct global hotkeys (e.g. `Alt+1`, `Ctrl+Alt+S`) to individual snippets.
- **JSON Import / Export**: Backup, share, and restore snippet collections safely.

### 6. 🔊 WebAudio Mechanical Keyboard Synthesizer
- Built-in WebAudio synthesizer with zero external audio assets.
- Sound profiles: **Cherry MX Blue** (clicky), **Cherry MX Brown** (tactile), and **Cherry MX Red** (linear).
- Adjustable synthesizer volume and instant mute toggle.

### 7. 🌐 Cross-Browser Native Extension Packages
- Emits fully compliant, validated Manifest V3 extensions for both browser engines:
  - **Chromium** (Chrome, Edge, Brave, Opera): Manifest V3 with background service worker, offscreen clipboard bridge, and PNG icon suite.
  - **Mozilla Firefox**: Gecko Manifest V3 with background page and Gecko add-on ID.
- In-browser dynamic ZIP exporter: Package customized extensions directly from the web interface.

---

## ⌨️ Default Keyboard Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Alt + Shift + V`** | **Auto-Type Clipboard** | Simulates typing the clipboard text into the active field. |
| **`Alt + K`** | **Snippet Palette** | Opens the in-page command palette overlay. |
| **`Alt + M`** | **Trigger Typo Mistake** | Injects an intentional typo and backspace correction during typing. |
| **`Alt + Shift + O`** | **Open Snippet Manager** | Launches the extension options / snippet management page. |
| **`Escape`** | **Emergency Stop** | Immediately aborts any ongoing simulated typing session. |
| **`:prefix + Tab`** | **Abbreviation Expansion** | Expands abbreviation triggers (e.g. `:sig` + `Tab`) into full snippets. |
| **Custom Hotkeys** | **Per-Snippet Keybindings** | Direct shortcuts assigned to individual snippets (e.g. `Alt+1`). |

*All shortcuts are fully configurable in settings and reject bare keys to prevent interference with normal typing.*

---

## 🚀 Quick Start

### 1. Run the Web Simulator Locally
```bash
# Install dependencies
npm install

# Start Vite dev server on port 3000
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to test typing heuristics, the strict anti-paste field, and audio feedback in the browser simulator.

### 2. Compile the Browser Extensions
```bash
# Compiles unpacked extensions into ./build/
npm run build:extension
```

Output folders:
- **`./build/chromium/`** — Load unpacked in Chrome, Brave, Edge, or Opera (`chrome://extensions` > Developer mode > Load unpacked).
- **`./build/firefox/`** — Load temporary add-on in Firefox (`about:debugging#/runtime/this-firefox` > Load Temporary Add-on > select `manifest.json`).

For complete build options and loading instructions, see [BuildInstructions.md](BuildInstructions.md).

---

## 🧪 Testing the Simulator

1. Start the app via `npm run dev` and navigate to the **Live Simulator** tab.
2. Choose a target test environment:
   - **Strict Anti-Paste Field**: Emulates proctored exam or banking fields that block `Ctrl+V`.
   - **Standard Form Input**: Test single-line form inputs and search bars.
   - **Code Editor**: Test multi-line code typing with authentic indentation.
   - **Rich Text Document**: Test `contenteditable="true"` document handling (Notion/Google Docs style).
3. Click **"Auto-Type into Target"** to watch characters stream into the field.
4. Inspect real-time DOM events (`keydown`, `keypress`, `beforeinput`, `input`, `keyup`) in the **Keystroke Event Inspector**.

---

## 📁 Repository Structure

```
auto_typer/
├── src/
│   ├── components/       # React UI tabs, modals, HUD & controls
│   ├── data/             # Default snippets, default settings & icon assets
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Typing engines, extension generator & audio synthesizer
│   ├── App.tsx           # Main application state & global shortcut router
│   └── main.tsx          # React application entry point
├── scripts/
│   └── build-extension.ts# Extension compilation script with manifest validator
├── build/                # Compiled browser extension targets (Chromium & Firefox)
├── dist/                 # Production web build (Vite output)
├── docs/                 # Documentation directory
│   ├── summary.md        # Architecture summary & future addons roadmap
│   ├── build-instructions.md # Complete build, packaging & loading instructions
│   ├── contributing.md   # Development workflow, coding style & PR guide
│   └── fixes.md          # Architectural audit log & bug fixes
└── LICENSE               # Apache 2.0 License
```

---

## 🛠️ Verification & Quality Checks

Run the automated validation suite before submitting pull requests:

```bash
# Type check (strict TypeScript)
npm run lint

# Production build
npm run build

# Syntax check all generated extension JS files
for f in $(find build -name "*.js"); do node --check "$f"; done
```

---

## 📄 License

This project is licensed under the [Apache 2.0 License](LICENSE).
