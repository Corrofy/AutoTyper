# AutoTyper Pro - Cross-Browser Extension

> Auto-types pasted snippets and clipboard text with realistic keystrokes, anti-paste bypass, in-page command palette, and customizable keyboard shortcuts. Compatible with **Google Chrome**, **Microsoft Edge**, **Brave**, **Opera**, and **Mozilla Firefox**.

---

## 📁 Build Output Overview

When you build or compile the extension, the final ready-to-load packages are generated inside the **`./build`** directory:

```
./build/
├── chromium/             <-- Load this into Chrome, Brave, Edge, Opera
│   ├── manifest.json     (Chromium MV3 with background service worker)
│   ├── background.js
│   ├── content.js
│   ├── content.css
│   ├── popup.html & popup.js
│   ├── options.html & options.js
│   └── icons/
├── firefox/              <-- Load this into Mozilla Firefox
│   ├── manifest.json     (Firefox MV3 with Gecko ID & background scripts)
│   ├── background.js
│   ├── content.js
│   ├── content.css
│   ├── popup.html & popup.js
│   ├── options.html & options.js
│   └── icons/
└── extension/            <-- Default Chromium unpacked target
```

---

## 🛠️ How to Compile / Build the Extension

To compile the latest extension files into the `./build` directory at any time, run:

```bash
# Build only the extension packages into ./build
npm run build:extension

# Or build both the web simulator and extension packages
npm run build
```

This compiles:
1. `./build/chromium/` — Manifest V3 tailored for Chromium engines.
2. `./build/firefox/` — Manifest V3 tailored for Firefox Gecko engine (`browser_specific_settings.gecko.id: autotyper-pro@example.com`).
3. `./build/extension/` — Universal unpacked build.

---

## 🚀 How to Install and Test in Chromium Browsers
*(Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi)*

1. Ensure the extension is built (run `npm run build:extension` or use the existing `./build/chromium` folder).
2. Open your browser and navigate to the Extensions management page:
   - **Google Chrome / Brave**: `chrome://extensions`
   - **Microsoft Edge**: `edge://extensions`
   - **Opera**: `opera://extensions`
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **"Load unpacked"** button.
5. In the file picker, select the **`./build/chromium`** folder (or the extracted folder if using ZIP).
6. Click **Select Folder**.
7. The **AutoTyper Pro** icon will appear in your extensions list and toolbar. Pin it to your toolbar for fast access!

---

## 🦊 How to Install and Test in Mozilla Firefox

1. Ensure the extension is built (run `npm run build:extension` or use the existing `./build/firefox` folder).
2. Open **Firefox** and enter this URL in the address bar:
   ```
   about:debugging#/runtime/this-firefox
   ```
3. Look for the **"Temporary Extensions"** section.
4. Click the **"Load Temporary Add-on..."** button.
5. Browse into the **`./build/firefox`** directory and select the **`manifest.json`** file.
6. Click **Open**.
7. **AutoTyper Pro** is now active in Firefox for testing and immediate use!

*(Note: Temporary extensions in Firefox remain active until Firefox is restarted. For permanent local installation, you can zip the contents of `./build/firefox/` and install via `about:addons` > "Install Add-on From File").*

---

## ⌨️ Features & Default Keyboard Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Alt + Shift + V`** | **Auto-Type Clipboard** | Types the current clipboard text into the focused input or form field with natural human timing. |
| **`Alt + M`** | **Trigger Manual Mistake** | **Manual Mistake Override**: Injects an intentional human-like typo with realistic hesitation and immediate backspace correction. |
| **`Alt + K`** | **In-Page Snippet Palette** | Opens a floating command palette on any page to search and select snippets using `↑`/`↓` and `Enter`. |
| **`Alt + Shift + O`** | **Open Snippet Manager** | Opens the extension settings and snippet management interface. |
| **`Escape`** | **Emergency Stop** | Immediately cancels any ongoing auto-typing simulation. |
| **`:prefix + Tab`** | **Abbreviation Expansion** | Type `:sig`, `:email`, or any custom trigger prefix followed by `Tab` to expand it in-place. |
| **Per-Snippet** | **Direct Hotkeys** | Assign custom keybindings (e.g. `Alt+1`, `Ctrl+Alt+S`) directly to individual snippets in the manager. |

All shortcuts are 100% configurable in the extension's **Settings & Snippet Manager** page (`options.html`).

---

## 🎯 Manual Mistake Override & Editor Compatibility (OneCompiler / Monaco)

### Why online IDEs (OneCompiler, Monaco, VS Code Web) were triggering Ctrl+F or Command Palettes:
In advanced browser-based code editors like Monaco (used by **OneCompiler**, GitHub Codespaces, etc.), simulated `KeyboardEvent` objects must strictly sanitize modifier keys (`ctrlKey: false`, `altKey: false`, `metaKey: false`) and provide canonical `code` mappings (such as `KeyF` vs letters without modifiers). Without strict isolation, Monaco's internal keybinding resolver would misinterpret simulated keystrokes as editor commands like `Ctrl+F` (Find) or `Ctrl+Shift+P` (Command Palette).

### The Solution & New Manual Mistake Control:
1. **Zero Unexpected Typos (Default `Manual Override`)**:
   - The engine now defaults to **Manual Mistake Mode** (`mistakeMode: 'manual'`). Auto-typing in online compilers is 100% clean and pristine by default.
2. **On-Demand Manual Mistakes**:
   - **Keyboard Shortcut**: Press **`Alt + M`** (or your custom recorded hotkey) at any moment while typing is active.
   - **Floating HUD Button**: Click the orange **`+Mistake (Alt+M)`** button on the bottom-right in-page floating HUD.
   - When triggered, the engine realistically types an adjacent QWERTY key, pauses in human-like realization (~150ms), presses backspace to delete it, and resumes clean typing.
3. **Three Mistake Modes in Settings**:
   - **Manual Override (Recommended)**: Flawless typing with on-demand manual triggers via hotkey or HUD button.
   - **100% Flawless**: Completely disables all typos under all conditions.
   - **Random Heuristic**: Traditional statistical typo simulation with adjustable error rate slider.

---

## 🛡️ Anti-Paste Bypass: How It Works

Many web applications (such as banking forms, login verification, or proctored test fields) disable pasting with:
```html
<input onpaste="return false;" />
```
Standard clipboard pastes trigger the browser's `paste` event and get blocked.

**AutoTyper Pro bypasses this restriction completely**:
1. When you trigger AutoTyper (via `Alt+Shift+V`, context menu, or snippet palette), it reads the text and dispatches genuine `KeyboardEvent` sequences (`keydown`, `keypress`, `keyup`) alongside native `beforeinput` and `input` events for every character.
2. Websites treat these as genuine physical keyboard presses from the user rather than clipboard pastes.
3. It emulates natural human typing cadence, configurable WPM speed, realistic jitter variance, and optional typos with auto-backspace correction.

---

## 🗂️ Snippet Management & Dynamic Templates

In the **Snippet Manager** (`options.html` or in the web dashboard):
- **Add & Edit Snippets**: Provide custom titles, categories, and multiple tags (`#work`, `#code`, `#email`).
- **Dynamic Variable Tags**: Insert auto-interpolated variables:
  - `{{date}}` — Current date (e.g., `10/29/2026`)
  - `{{time}}` — Current time (e.g., `10:15 PM`)
  - `{{weekday}}` — Current day of the week (e.g., `Thursday`)
  - `{{year}}` — Current year (e.g., `2026`)
  - `{{name}}` — Contact name
  - `{{email}}` — Contact email
- **Search & Tag Filter**: Rapidly filter snippets by tag chips or real-time text search.
- **Export / Import**: Backup your snippets to `autotyper-snippets.json` or import an existing snippet library.

---

## 🧪 Testing with the Web Simulator

You can test the keystroke emulation and anti-paste bypass live in the web app before loading it into your browser:
1. Run `npm run dev` and open the local web interface.
2. Select the **"Live Simulator"** tab.
3. Switch the target to **"Strict Anti-Paste Field"** to test simulated keystrokes against a paste-locked input.
4. Open the **"Keystroke Event Inspector"** to monitor real-time DOM events being dispatched.
