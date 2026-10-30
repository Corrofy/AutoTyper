# AutoTyper Pro — Project Summary & Architecture Roadmap

> **Document Version:** 1.0.0  
> **Target Audience:** Maintainers, Contributors, and Extension Developers  
> **Scope:** Architecture summary, data flow, dual-engine mechanics, and forward-looking roadmap for future addons and improvements.

---

## 🧭 1. Executive Summary

**AutoTyper Pro** is an open-source, dual-target productivity suite designed to simulate natural, human-like keystroke typing into any web text field, input, code editor, or proctored form. It solves a fundamental limitation of traditional clipboard pasting: web applications frequently disable paste events (`onpaste="return false;"`) or deploy behavioral bot-detection systems that flag instantaneous block text insertions.

AutoTyper Pro operates across two coordinated platforms:
1. **Interactive Web Application**: A full-featured React 19 / Vite simulator allowing users to configure typing heuristics, test bypass against strict anti-paste fields, inspect synthetic DOM events in real time, and customize snippet libraries.
2. **Cross-Browser Extension**: A unified compilation pipeline that emits production-grade, zero-dependency Manifest V3 extensions for both **Chromium** (Chrome, Edge, Brave, Opera) and **Gecko** (Mozilla Firefox).

---

## 🏛️ 2. Core Architecture & System Flow

```
                      ┌───────────────────────────────────────────────┐
                      │              User Configuration               │
                      │  - Snippet Library (CRUD, Tags, Triggers)     │
                      │  - Speed Presets (WPM, Jitter, Punctuation)   │
                      │  - Mistake Mode (Manual, Flawless, Random)    │
                      │  - Custom Global & Snippet Shortcuts          │
                      └──────────────────────┬────────────────────────┘
                                             │
                      ┌──────────────────────┴────────────────────────┐
                      ▼                                               ▼
         ┌─────────────────────────┐                     ┌─────────────────────────┐
         │   React Web Simulator   │                     │   Extension Generator   │
         │ (src/utils/autoTyper    │                     │ (src/utils/extension    │
         │       Engine.ts)        │                     │      Generator.ts)      │
         └────────────┬────────────┘                     └────────────┬────────────┘
                      │                                               │
                      ▼                                               ▼
         ┌─────────────────────────┐                     ┌─────────────────────────┐
         │ WebAudio Synth Feedback │                     │  Output Distributions   │
         │ - Cherry MX Blue        │                     │  - ./build/chromium/    │
         │ - Cherry MX Brown       │                     │  - ./build/firefox/     │
         │ - Cherry MX Red         │                     │  - In-Browser .ZIP      │
         └─────────────────────────┘                     └────────────┬────────────┘
                                                                      │
                                                        ┌─────────────┴─────────────┐
                                                        ▼                           ▼
                                              ┌──────────────────┐        ┌──────────────────┐
                                              │  Chromium (MV3)  │        │  Firefox (MV3)   │
                                              │ - Service Worker │        │ - Background     │
                                              │ - Offscreen DOM  │        │   Page (DOM)     │
                                              │ - Content Script │        │ - Content Script │
                                              └──────────────────┘        └──────────────────┘
```

### 2.1 Dual-Engine Design: Simulator vs. In-Page Content Script

To guarantee that what users test in the web simulator behaves identically in the wild, the application maintains two parallel typing engines with strict behavioral parity:

| Feature | Web Simulator (`autoTyperEngine.ts`) | Extension Content Script (`content.js`) |
| :--- | :--- | :--- |
| **Execution Context** | Sandboxed DOM within React application | Injected into host webpage (top frame + iframes) |
| **Event Sequence** | `keydown` ➔ `keypress` ➔ `beforeinput` ➔ `input` ➔ `keyup` | `keydown` ➔ `keypress` ➔ `beforeinput` ➔ `input` ➔ `keyup` |
| **Modifier Isolation** | `ctrlKey: false`, `altKey: false`, `metaKey: false` | `ctrlKey: false`, `altKey: false`, `metaKey: false` |
| **Contenteditable Caret** | Caret-aware `Range` / `Selection` insertion & `<br>` | Caret-aware `Range` / `Selection` insertion & `<br>` |
| **Backspace Correction** | Caret-aware TextNode `.deleteData()` / DOM cleanup | Caret-aware TextNode `.deleteData()` / DOM cleanup |
| **Variable Substitution** | `{{date}}`, `{{time}}`, `{{name}}`, `{{year}}`, etc. | `{{date}}`, `{{time}}`, `{{name}}`, `{{year}}`, etc. |
| **Audio Feedback** | Shared WebAudio oscillator click synthesizer | Standalone embedded WebAudio oscillator |
| **Interception** | Simulates paste block and auto-type paste | Native `paste` event capture & cancellation |

### 2.2 Clipboard Architecture in Manifest V3

Chromium Manifest V3 service workers lack DOM access (`window` and `document` are undefined), which prevents calling `navigator.clipboard.readText()`. AutoTyper Pro solves this cross-browser discrepancy:
1. **Chromium**: The background service worker spins up a hidden offscreen document (`offscreen.html` / `offscreen.js`) using the `offscreen` and `clipboardRead` permissions. The offscreen document reads the system clipboard and routes text back via message passing.
2. **Firefox**: Firefox MV3 background pages retain DOM access and read directly from `navigator.clipboard`.
3. **Content Script Fallback**: The in-page script attempts background-assisted clipboard reads first, falls back to document-level clipboard APIs if user activation is present, and utilizes a temporary off-screen textarea fallback if available.

### 2.3 Editor Protection & Modifier Isolation

Online code editors like **Monaco Editor** (OneCompiler, GitHub Codespaces) and **CodeMirror** monitor keyboard events to invoke command palettes (`Ctrl+Shift+P`), find dialogues (`Ctrl+F`), and multi-cursor actions.
- AutoTyper Pro strictly clears all synthetic modifier keys during text generation.
- Typo simulation defaults to **Manual Override Mode** (`mistakeMode: 'manual'`), ensuring that complex code snippets type cleanly without triggering compiler syntax errors or editor shortcuts.
- Users trigger intentional typos on demand via **`Alt + M`** or the floating HUD button.

---

## 🧩 3. Key Modules & Subsystems

### `src/utils/autoTyperEngine.ts`
- Encapsulates `AutoTyperSession` lifecycle: `start()`, `pause()`, `resume()`, `cancel()`, `triggerManualMistake()`.
- Calculates human delay based on WPM, Gaussian jitter factor, and character-type pauses (sentence terminals `.`, `!`, `?` and word spaces).
- Resolves caret positioning in standard inputs, textareas, and contenteditable DOM trees.

### `src/utils/extensionGenerator.ts`
- Single source of truth for generating browser extension bundles.
- Produces `manifest.json`, `background.js`, `content.js`, `content.css`, `popup.html`, `popup.js`, `options.html`, `options.js`, and `offscreen.*`.
- Embeds real binary PNG icons (16, 32, 48, 128 px) from `src/data/iconAssets.ts` into both build-time folders and client-side ZIP downloads.

### `src/utils/keyboardSound.ts`
- Zero-asset WebAudio frequency synthesizer producing authentic mechanical switch clicks.
- Emulates Cherry MX Blue (high-frequency tactile click), Cherry MX Brown (mid-range thock), and Cherry MX Red (linear clack).

### `src/utils/shortcutHelper.ts`
- Formats and matches user keybindings.
- Enforces strict modifier requirements: single printable characters and bare Shift combinations (like `Shift+A`) are rejected to prevent hijacking normal uppercase typing.

### `src/utils/snippetValidation.ts`
- Provides strict schema normalization for JSON snippet imports.
- Generates unique IDs and fallback categories, guarding against corrupted imports or missing fields.

---

## 🚀 4. Roadmap & Future Addons

The following improvements and feature addons represent high-priority opportunities for future releases:

### 4.1 Multi-Profile / Persona System
- **Current State**: A single global speed and mistake configuration is shared.
- **Future Improvement**: Introduce named typing profiles:
  - *"Careful Coder"*: 60 WPM, low jitter, 0% typos, extended punctuation pauses for brackets and semicolons.
  - *"Casual Chatter"*: 95 WPM, 45% jitter, human mistake simulation enabled.
  - *"Assessment / Proctor Bypass"*: 70 WPM, steady rhythm, natural pause delays.
  - *"Instant / Turbo"*: Maximum speed for repetitive form automation.
- **Implementation**: Persist profiles in `settings.profiles: Record<string, AutoTyperProfile>` and allow hotkey switching (`Alt+Shift+1..4`).

### 4.2 Non-QWERTY & International Keyboard Layouts
- **Current State**: Adjacent key typos are mapped using `QWERTY_ADJ`.
- **Future Improvement**:
  - Add layout matrices for **AZERTY** (French), **QWERTZ** (German), **Dvorak**, and **Colemak**.
  - Dynamically select the typo adjacency graph based on `navigator.language` or user setting.
  - Support accented / multi-byte character inputs (e.g. `é`, `ñ`, `ü`, `ß`).

### 4.3 Context-Aware Syntax Cadence (Code-Aware Typist)
- **Current State**: Delays apply uniformly to all characters with extra pauses on punctuation.
- **Future Improvement**:
  - Implement language-aware pacing: brief human hesitation before starting complex function blocks, indentations, or string literals.
  - Realistic burst typing: humans type familiar keywords (e.g. `function`, `const`, `return`, `import`) significantly faster than variable identifiers.

### 4.4 Form Field Auto-Sequence (Multi-Field Tab Automation)
- **Current State**: Types into the currently active focused element.
- **Future Improvement**:
  - Add multi-field macros supporting the `{{tab}}` variable token.
  - When encountering `{{tab}}`, the engine dispatches a synthetic `Tab` navigation key, shifts focus to the next sequential form input, and continues typing.
  - Allows single-click population of entire registration, checkout, or login forms.

### 4.5 AI Completion & Draft Expansion
- **Current State**: Snippets must be authored in advance or pasted from the clipboard.
- **Future Improvement**:
  - Optional integration with local on-device models (e.g. Chrome built-in `window.ai` / Gemini Nano) or user-supplied API keys.
  - Allows prompting inline (e.g. typing `/summarize` or `/reply-polite`) and having the AI output streamed character-by-character as realistic typing.

### 4.6 Encrypted Cloud Sync & Export Integrations
- **Current State**: Snippets and settings are stored locally in `chrome.storage.local` and browser `localStorage`.
- **Future Improvement**:
  - Optional encrypted sync via WebDAV, Google Drive, or private GitHub Gist.
  - End-to-end encryption with user passphrase before syncing.

### 4.7 Native Desktop Companion Agent
- **Current State**: Restricted to browser windows and web applications.
- **Future Improvement**:
  - Lightweight background daemon (written in Rust or Go) utilizing native OS virtual input APIs (`uinput` on Linux, `SendInput` on Windows, `CGEvent` on macOS).
  - Bridges the browser extension via Native Messaging (`browser.runtime.connectNative`) to auto-type into native desktop applications (terminal emulators, Slack desktop, VS Code desktop).

---

## 🔒 5. Security & Permission Boundaries

When developing new addons, maintain these security best practices:

1. **ActiveTab Principle**: Prefer `activeTab` and user-initiated activations over broad `<all_urls>` script injections where possible.
2. **Sanitize Template Tags**: Variable interpolation (`interpolateSnippetVariables`) must treat inputs as plain text and never inject HTML or execute code in DOM contexts.
3. **No External Network Dependencies in Injected Scripts**: The extension content script must remain 100% self-contained without fetching remote scripts or tracking telemetry.
4. **Isolated Storage**: Snippet data must remain in local sandboxed storage unless explicitly exported by the user.

---

## 📚 6. Documentation Index

- [Build Instructions](build-instructions.md) — Comprehensive guide to compiling, packaging, and loading extensions.
- [Contributing Guidelines](contributing.md) — Coding conventions, testing workflow, and PR checklist.
- [Fixes Audit Log](fixes.md) — Detailed technical audit of bugs found and resolved.
