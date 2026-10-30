# Contributing to AutoTyper Pro

Thank you for your interest in contributing to **AutoTyper Pro**! This document provides guidelines, architectural details, and workflows to help you contribute effectively.

---

## 🧭 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and considerate in all interactions.

---

## 🏗️ Architecture & Project Structure

AutoTyper Pro is built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**. It serves two primary roles:
1. **Interactive Web Simulator**: Allows testing keystroke emulation, anti-paste bypass, and audio feedback in a simulated environment.
2. **Cross-Browser Extension Generator**: Dynamically generates and packages Manifest V3 browser extensions for Chromium and Gecko (Firefox) engines.

```
auto_typer/
├── src/
│   ├── components/                 # React UI components
│   │   ├── Header.tsx              # Application header & navigation
│   │   ├── SimulatorTab.tsx        # Interactive typing sandbox & event inspector
│   │   ├── SnippetsTab.tsx         # Snippet CRUD, tag filters, import/export
│   │   ├── ConfigTab.tsx           # Typing engine speed & shortcut settings
│   │   ├── ExportTab.tsx           # Extension code inspector & ZIP exporter
│   │   ├── TypingHUD.tsx           # Floating real-time progress & mistake indicator
│   │   ├── CommandPaletteModal.tsx # In-app snippet quick search palette (Alt+K)
│   │   ├── PopupEmulatorModal.tsx  # Browser action popup preview
│   │   └── ShortcutRecorder.tsx    # Interactive keyboard shortcut recorder
│   ├── data/
│   │   ├── defaultSnippets.ts      # Initial snippets & default configuration
│   │   └── iconAssets.ts           # Base64-encoded PNG icons (16, 32, 48, 128 px)
│   ├── types/
│   │   └── extension.ts            # Core TypeScript interfaces & types
│   ├── utils/
│   │   ├── autoTyperEngine.ts      # Web engine session, keystroke dispatch & timing
│   │   ├── extensionGenerator.ts   # Browser extension source code generator & zip packer
│   │   ├── keyboardSound.ts        # WebAudio mechanical keyboard synthesizer
│   │   ├── shortcutHelper.ts       # Shortcut parsing, formatting & event matching
│   │   └── snippetValidation.ts    # JSON schema validator & sanitizer for snippets
│   ├── App.tsx                     # Main application state & global shortcut router
│   ├── main.tsx                    # React application entry point
│   └── index.css                   # Global styles & Tailwind directives
├── scripts/
│   └── build-extension.ts          # Node script compiling extension packages into ./build
├── build/                          # Generated extension packages (Chromium & Firefox)
├── dist/                           # Compiled production web app (from Vite)
├── BuildInstructions.md            # Detailed build, packaging & loading instructions
└── FIXES.md                        # Audit log of bug fixes and architectural enhancements
```

---

## 💻 Development Workflow

### 1. Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### 2. Fork and Clone
```bash
git clone https://github.com/<your-username>/auto_typer.git
cd auto_typer
git checkout -b feature/my-new-feature
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. Any edits in `src/` will hot-reload automatically.

### 5. Build and Test Extensions
Whenever modifying extension templates in `src/utils/extensionGenerator.ts`:
```bash
npm run build:extension
```
Then reload the unpacked extension in Chrome (`chrome://extensions`) or Firefox (`about:debugging`).

---

## 📐 Coding Conventions & Guidelines

### TypeScript & Strict Typing
- Keep `tsconfig.json` strict settings satisfied (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`).
- Ensure all types and interfaces are documented and placed in `src/types/extension.ts` or co-located with their utilities.
- Always run `npm run lint` (`tsc --noEmit`) before submitting a pull request.

### Dual-Engine Parity: Web Engine vs. Extension Content Script
AutoTyper Pro operates two execution environments that **must remain in sync**:
1. **Web Engine** (`src/utils/autoTyperEngine.ts`): Powers the Live Simulator in the web application.
2. **Content Script** (`src/utils/extensionGenerator.ts` `contentJs`): Injected into arbitrary web pages by the extension.

When adding or modifying typing behaviors, ensure parity across both:
- **Variable Interpolation**: Tag templates (`{{date}}`, `{{time}}`, `{{name}}`, etc.) must be supported in both engines.
- **Modifier Isolation**: When dispatching synthetic `KeyboardEvent`s (`keydown`, `keypress`, `keyup`), explicitly set `ctrlKey: false`, `altKey: false`, and `metaKey: false` (unless a modifier is actually active) to prevent web editors (like Monaco or CodeMirror) from misinterpreting keystrokes as hotkeys.
- **Caret-Aware Manipulation**: Always use caret-aware `Selection` and `Range` APIs for both insertion and backspacing in contenteditable elements (`isContentEditable`), falling back to `execCommand` and native input properties where appropriate.
- **Settings Respect**: Both engines must respect `speedMode`, `baseDelayMs`, `jitterPercent`, `punctuationPauseMs`, `mistakeMode`, and `antiPasteBypass`.

### Keyboard Shortcut Handling
- Single bare printable keys (`A`, `1`, `/`) must **never** be registered as shortcuts without modifier keys (`Ctrl`, `Alt`, or `Meta`).
- `Shift` alone is rejected for printable characters to prevent hijacking capital letter typing.
- Only function keys (`F1`–`F12`) and navigation keys (`Escape`, `Tab`, `Enter`) are permitted without modifiers.

### Idempotency & Clean Up
- Injected extension content scripts must check `window.__autotyperProInjected` to avoid duplicate event listeners if injected multiple times into frames.
- Always unregister event listeners, remove temporary DOM elements, and revoke object URLs (`URL.revokeObjectURL`) when destroying sessions or modals.

---

## 🧪 Pre-Submission Checklist

Before opening a pull request, verify that all automated checks pass:

```bash
# 1. Type check
npm run lint

# 2. Production build (Vite + extension compiler)
npm run build

# 3. Verify syntax of generated extension scripts
for f in $(find build -name "*.js"); do
  node --check "$f"
done
```

---

## 📨 Submitting a Pull Request

1. **Commit Messages**: Use concise, conventional commit messages:
   - `feat: add sound volume slider to popup`
   - `fix: prevent duplicate input events on contenteditable fields`
   - `docs: update build instructions for firefox`
2. **Pull Request Description**:
   - Clearly explain the problem being solved or the feature introduced.
   - Reference any related issues.
   - Provide reproduction steps and manual testing notes.
3. **Review Process**:
   - Maintainers will review your PR and provide constructive feedback.
   - Keep your branch rebased onto `main` to avoid merge conflicts.

---

## 💡 Reporting Bugs & Requesting Features

- **Bug Reports**: Open an issue detailing the browser, OS version, steps to reproduce, expected behavior, and console output.
- **Feature Requests**: Open a discussion or issue explaining the use case, desired UX, and technical considerations.
