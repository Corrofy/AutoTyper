# AutoTyper Pro — Complete Extension & Simulator Usage Guide

> A complete, step-by-step guide to using **AutoTyper Pro** across all supported browsers (Google Chrome, Brave, Microsoft Edge, Opera, Mozilla Firefox) and the interactive Web Simulator.

---

## 📑 Table of Contents

1. [Introduction](#1-introduction)
2. [Installation & Setup](#2-installation--setup)
   - [Chromium (Chrome, Brave, Edge, Opera)](#chromium-browsers-chrome-brave-edge-opera)
   - [Mozilla Firefox](#mozilla-firefox)
   - [Web Simulator (No Install Required)](#web-simulator-no-install-required)
3. [The 6 Ways to Auto-Type](#3-the-6-ways-to-auto-type)
   - [1. Auto-Type Clipboard Content (`Alt + Shift + V`)](#1-auto-type-clipboard-content-alt--shift--v)
   - [2. In-Page Command Palette (`Alt + K`)](#2-in-page-command-palette-alt--k)
   - [3. Inline Abbreviation Triggers (`:trigger` + Tab/Space)](#3-inline-abbreviation-triggers-trigger--tabspace)
   - [4. Direct Per-Snippet Hotkeys (e.g., `Alt + 1`)](#4-direct-per-snippet-hotkeys)
   - [5. Right-Click Context Menu](#5-right-click-context-menu)
   - [6. Browser Toolbar Popup Menu](#6-browser-toolbar-popup-menu)
4. [Live On-Page HUD & Typing Controls](#4-live-on-page-hud--typing-controls)
   - [Floating HUD Pill](#floating-hud-pill)
   - [Live Speed Adjustment (`Alt + [` and `Alt + ]`)](#live-speed-adjustment-alt---and-alt--)
   - [Pausing & Resuming Typing (`Alt + P`)](#pausing--resuming-typing-alt--p)
   - [Injecting Realistic Typos (`Alt + M`)](#injecting-realistic-typos-alt--m)
   - [Emergency Stop (`Escape`)](#emergency-stop-escape)
   - [Background Tab Protection (Auto-Pause)](#background-tab-protection-auto-pause)
5. [Managing Snippets & Dynamic Templates](#5-managing-snippets--dynamic-templates)
   - [Creating & Editing Snippets](#creating--editing-snippets)
   - [Dynamic Template Tags (`{{date}}`, `{{time}}`, etc.)](#dynamic-template-tags)
   - [Importing & Exporting Snippets (JSON)](#importing--exporting-snippets-json)
6. [Speed Modes, Jitter & Mechanical Keyboard Sounds](#6-speed-modes-jitter--mechanical-keyboard-sounds)
   - [Speed Presets](#speed-presets)
   - [Natural Human Variance (Jitter)](#natural-human-variance-jitter)
   - [Punctuation Pauses](#punctuation-pauses)
   - [Mechanical Keyboard Sound Synthesis](#mechanical-keyboard-sound-synthesis)
7. [Bypassing Anti-Paste Restrictions](#7-bypassing-anti-paste-restrictions)
   - [How Anti-Paste Forms Work](#how-anti-paste-forms-work)
   - [How AutoTyper Bypasses Them](#how-autotyper-bypasses-them)
   - [Compatibility Across Web Inputs](#compatibility-across-web-inputs)
8. [Configuring Shortcuts & Settings](#8-configuring-shortcuts--settings)
9. [Troubleshooting & FAQ](#9-troubleshooting--faq)

---

## 1. Introduction

**AutoTyper Pro** is an intelligent keystroke emulator and snippet manager. Instead of instantly pasting text from your clipboard (which many proctored exam portals, banking forms, and hiring test sites block), AutoTyper generates authentic hardware-like keyboard events (`keydown`, `keypress`, `beforeinput`, `input`, `keyup`) character by character.

Whether you need to bypass a strict `onpaste="return false;"` restriction, stream code snippets into web IDEs (Monaco, CodeMirror, Ace), or quickly expand canned replies in chat apps, AutoTyper handles it seamlessly.

---

## 2. Installation & Setup

### Chromium Browsers (Chrome, Brave, Edge, Opera)

1. **Download or Build** the extension package:
   - Grab `autotyper-pro-chromium-v1.2.1.zip` from your releases, or run `npm run build:extension` in the repository to generate `./build/chromium/`.
   - If using a ZIP file, extract it to a permanent folder on your computer.
2. Open your browser's extension manager:
   - Chrome / Brave / Opera: Navigate to `chrome://extensions`
   - Edge: Navigate to `edge://extensions`
3. Enable **Developer mode** (toggle switch in the top-right corner).
4. Click **Load unpacked** in the top-left corner.
5. Select the extracted folder (or `./build/chromium`).
6. Pin the AutoTyper Pro icon to your browser toolbar for easy access.

### Mozilla Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select `manifest.json` from `./build/firefox/` (or the extracted `autotyper-pro-firefox-v1.2.1.zip`).
4. The extension is now active in Firefox.

### Web Simulator (No Install Required)

You can test every feature without installing the browser extension:
1. Start the local server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000` in your browser.
3. Switch to the **Simulator** tab to test against strict anti-paste inputs, code editors, and rich-text areas.

---

## 3. The 6 Ways to Auto-Type

AutoTyper Pro provides multiple ergonomic ways to trigger simulated typing depending on your workflow:

### 1. Auto-Type Clipboard Content (`Alt + Shift + V`)

This is the fastest way to auto-type whatever you just copied:
1. Copy any text from anywhere (`Ctrl + C` or `Cmd + C`).
2. Click into any input field, textarea, chatbox, or code editor on any web page.
3. Press **`Alt + Shift + V`**.
4. AutoTyper reads the clipboard and streams the text into the field character-by-character.

> **Note on Permissions:** On Chromium browsers, the extension utilizes an offscreen document bridge so clipboard reads succeed even when web pages restrict direct clipboard access.

---

### 2. In-Page Command Palette (`Alt + K`)

Search and trigger any snippet without taking your hands off the keyboard:
1. Click into any editable field.
2. Press **`Alt + K`**.
3. A modal search overlay appears in the center of the web page.
4. Type any keyword, tag, or snippet title (e.g., `email`, `sql`, `support`).
5. Use **`↑` / `↓`** arrow keys to highlight a snippet.
6. Press **`Enter`** to type it into the field.
7. Tap **`Escape`** at any time to close the palette without typing.

---

### 3. Inline Abbreviation Triggers (`:trigger` + Tab/Space)

Expand short keywords into full text directly inside the text box (like mobile keyboard text replacement):
1. Give your snippet an abbreviation starting with `:` or `!` (e.g., `:sig`, `:addr`, `!meet`).
2. In any text box, type the trigger:
   ```text
   :sig
   ```
3. Press your configured trigger key (**`Tab`** by default, or **`Space`**).
4. AutoTyper automatically deletes `:sig` and types out the full snippet.

*See the [Configuring Quick Trigger Key](#8-configuring-shortcuts--settings) section to switch between Tab and Space.*

---

### 4. Direct Per-Snippet Hotkeys

Assign custom global shortcuts to your most frequent snippets:
- Example: Press **`Alt + 1`** to type your email signature.
- Example: Press **`Alt + 2`** to type a meeting confirmation note.
- Example: Press **`Ctrl + Alt + S`** for a boilerplate code snippet.

*Per-snippet shortcuts can be set in the Snippet Manager.*

---

### 5. Right-Click Context Menu

If you prefer mouse navigation:
1. Right-click inside any editable text field.
2. Hover over **AutoTyper Pro** in the context menu.
3. Choose:
   - **Auto-Type Clipboard Text**: Types current clipboard contents.
   - **Quick Snippet Command Palette...**: Opens the in-page search palette.
   - **Top Snippets**: Pick from your top 6 most-used snippets directly.

---

### 6. Browser Toolbar Popup Menu

Click the AutoTyper Pro icon in the browser toolbar:
- Click **Auto-Type Clipboard** to type clipboard text into the active tab.
- Click **Type** next to any snippet in your library.
- Use the quick search bar to filter snippets.
- Click the gear icon to open full extension options.

---

## 4. Live On-Page HUD & Typing Controls

Whenever AutoTyper begins typing on any webpage, a floating HUD pill appears in the bottom-right corner of the screen.

```text
┌────────────────────────────────────────────────────────────────────────┐
│  ● Auto-Typing...   42 / 120 chars   [ −  75 WPM  + ] [⚡]   ⏸ Pause   +Mistake   Stop  │
└────────────────────────────────────────────────────────────────────────┘
```

### Floating HUD Pill
- **Progress Counter**: Shows current characters typed vs. total snippet length.
- **Pulse Dot**: Glows blue while actively typing; turns amber when paused.
- **Dynamic Status**: Displays title or active pause reason (`Paused (Manual)` / `Paused (Tab Inactive)`).

### Live Speed Adjustment (`Alt + [` and `Alt + ]`)
You can adjust typing speed on the fly without stopping your typing session:
- **Decrease Speed**: Press **`Alt + [`** (or click **`−`** on the HUD) to slow down by 10 WPM.
- **Increase Speed**: Press **`Alt + ]`** (or click **`+`** on the HUD) to speed up by 10 WPM.
- **Toggle Turbo**: Click the **`⚡`** button on the HUD to immediately switch between human speed and maximum Turbo speed (12ms per keystroke).

### Pausing & Resuming Typing (`Alt + P`)
Need to take a breather, look at reference notes, or answer someone?
- Press **`Alt + P`** (or click **`⏸ Pause`** on the HUD) to freeze typing instantly.
- The HUD button turns emerald: **`▶ Resume`**.
- Press **`Alt + P`** again (or click **`▶ Resume`**) to pick up typing from the exact character where you paused.
- *Paused time is automatically excluded from WPM statistics.*

### Injecting Realistic Typos (`Alt + M`)
AutoTyper defaults to 100% clean typing so it never makes mistakes when you don't want them. However, if you want your typing to look completely human during screen sharing or proctored sessions:
1. Press **`Alt + M`** (or click **`+Mistake`** on the HUD).
2. On the next character, AutoTyper will:
   - Hit a realistic adjacent key on the QWERTY layout (e.g. typing `w` instead of `e`).
   - Pause for a brief human realization delay (~140ms).
   - Press Backspace to erase the typo.
   - Pause briefly (~100ms) and type the correct character.
   - Increment the "Typos Corrected" counter on your stats.

### Emergency Stop (`Escape`)
- Press **`Escape`** (or click **`Stop`** on the HUD) at any moment to cancel typing immediately.

### Background Tab Protection (Auto-Pause)
If you switch browser tabs or minimize the window while AutoTyper is actively typing:
1. The engine detects focus loss via `visibilitychange` and `window.blur`.
2. It automatically freezes typing (`Paused (Tab Inactive)`).
3. When you switch back to the tab, the engine re-focuses the input element, restores the cursor caret, allows 150ms for the DOM to settle, and smoothly resumes typing.
4. No dropped characters, no caret jumping, and no corrupted WPM calculations.

---

## 5. Managing Snippets & Dynamic Templates

Open the Snippet Manager via the extension toolbar popup or press **`Alt + Shift + O`**.

### Creating & Editing Snippets

Each snippet supports the following fields:
- **Title**: A recognizable name (e.g. *Customer Refund Response*).
- **Category**: Filter by *Email*, *Code*, *Forms*, *Chat*, *Testing*, or *Custom*.
- **Tags**: Space/comma-separated search tags (e.g. `billing, refund, tier1`).
- **Shortcut Trigger**: Abbreviation prefix for inline expansion (e.g. `:refund`).
- **Keyboard Shortcut**: Direct key combination (e.g. `Alt+1` or `Ctrl+Alt+R`).
- **Content**: The multi-line text or code template.

### Dynamic Template Tags

AutoTyper replaces smart tags at the exact moment of typing:

| Tag | Replacement | Example Output |
| :--- | :--- | :--- |
| `{{date}}` | Local date string | `10/30/2026` |
| `{{time}}` | Local time (hours & minutes) | `03:45 PM` |
| `{{weekday}}` | Full day of the week | `Friday` |
| `{{month}}` | Full name of the current month | `October` |
| `{{year}}` | Current four-digit year | `2026` |
| `{{timestamp}}`| ISO 8601 UTC timestamp | `2026-10-30T10:30:00.000Z` |
| `{{name}}` | Preset client/contact name | `Jordan Taylor` |
| `{{email}}` | Preset contact email | `jordan.taylor@example.com` |
| `{{ticket_id}}`| Random 6-digit reference number | `784912` |

#### Example Template:
```text
Hi {{name}},

Your ticket #{{ticket_id}} was logged on {{weekday}}, {{month}} {{date}} at {{time}}.
Our engineering team is actively investigating the report.

Best regards,
Jordan
```

### Importing & Exporting Snippets (JSON)
- Click **Export JSON** to download a backup of your snippet library.
- Click **Import JSON** to load snippets from a file. AutoTyper validates the schema, sanitizes inputs, and generates unique IDs to prevent collisions.

---

## 6. Speed Modes, Jitter & Mechanical Keyboard Sounds

Configure your typist profile in **Settings / Config**:

### Speed Presets
- **Human (Default)**: Set your target Words Per Minute (e.g. 65–85 WPM). Keystroke delay is calculated as `60,000 / (WPM * 5)`.
- **Steady**: Types with a fixed millisecond delay between keys (e.g. 45ms).
- **Turbo**: Ultra-fast mode (12ms per keystroke) for high-volume inputs.
- **Custom**: Full manual control over delays and pause intervals.

### Natural Human Variance (Jitter)
- Set **Jitter** from `0%` to `100%` (30–40% recommended).
- Applies random micro-timing fluctuations to consecutive keys so keystrokes never look like a robotic fixed-interval script.

### Punctuation Pauses
- Configurable pause (default: 140ms) automatically applied after `.`, `!`, `?`, `;`, and newlines (`\n`).
- Shorter pauses (60% duration) applied after commas `,` and colons `:`.
- Mirrors human cognitive pauses between sentences.

### Mechanical Keyboard Sound Synthesis
AutoTyper includes a zero-dependency **WebAudio API synthesizer** that generates authentic switch clicks:
- **Cherry MX Blue**: Crisp, high-frequency tactile click.
- **Cherry MX Brown**: Subtle, mellow mechanical bump.
- **Cherry MX Red**: Smooth, linear switch sound.
- **Silent**: Mute all audio feedback.
- **Volume Slider**: Adjust sound volume from 0% to 100%.

---

## 7. Bypassing Anti-Paste Restrictions

### How Anti-Paste Forms Work
Web portals commonly disable clipboard pasting by adding listeners:
```html
<input onpaste="return false;" />
<textarea onpaste="e.preventDefault();" />
```
These scripts only listen for the browser's native `ClipboardEvent` (`paste`).

### How AutoTyper Bypasses Them
When AutoTyper runs with **Anti-Paste Bypass** enabled (the default):
1. It never dispatches a `paste` event.
2. For every single character, it fires trusted-like synthetic DOM events in standard browser sequence:
   - `KeyboardEvent('keydown')`
   - `KeyboardEvent('keypress')`
   - `InputEvent('beforeinput', { inputType: 'insertText', data: char })`
   - Native text insertion (`document.execCommand('insertText')` or caret-aware insertion)
   - `KeyboardEvent('keyup')`
3. Anti-paste security scripts see legitimate single-character keystrokes identical to physical typing.

### Compatibility Across Web Inputs
AutoTyper Pro is tested and hardened across all major web input types:
- **Standard Inputs & Textareas**: `<input type="text">`, `<textarea>`
- **Monaco Editor**: VS Code Web, OneCompiler, LeetCode, GitHub Codespaces
  - *Includes smart virtual indentation detection without destructive backspacing.*
- **CodeMirror 5 & 6**: JSFiddle, CodePen, Overleaf
- **Ace Editor**: Cloud9, Replit
- **Rich Text / ContentEditable**: Notion, Google Docs, Slack, Quill, ProseMirror

---

## 8. Configuring Shortcuts & Settings

Open **Settings / Config** to modify any keybinding:

| Shortcut Setting | Default Key | Purpose |
| :--- | :--- | :--- |
| **Auto-Type Clipboard** | `Alt + Shift + V` | Type current clipboard contents into active field |
| **Open Snippet Picker** | `Alt + K` | Show in-page search command palette |
| **Open Snippet Manager** | `Alt + Shift + O` | Open extension options page in a tab |
| **Emergency Stop** | `Escape` | Instantly abort any active typing session |
| **Pause / Resume** | `Alt + P` | Freeze or resume typing |
| **Trigger Mistake** | `Alt + M` | Inject a human typo and backspace correction |
| **Decrease Speed** | `Alt + [` | Slow down by 10 WPM on the fly |
| **Increase Speed** | `Alt + ]` | Speed up by 10 WPM on the fly |
| **Quick Trigger Key** | `Tab` (or `Space`) | Expand `:trigger` abbreviations |

### How to Record a New Shortcut:
1. Click on the shortcut button (it turns amber and says *"Press key combination..."*).
2. Press your desired keys (e.g. `Ctrl + Alt + T`).
3. *Note:* Printable keys require at least one modifier (`Ctrl`, `Alt`, or `Meta`) to prevent hijacking normal writing.
4. **Clearing a Shortcut**: Press **`Backspace`** or **`Delete`** while recording to clear the keybinding back to *None*.

---

## 9. Troubleshooting & FAQ

#### Q: Nothing happens when I press `Alt + Shift + V` or use a shortcut.
- **Answer:** Make sure you clicked into an editable field first (the cursor must be blinking inside an `<input>`, `<textarea>`, or code editor). AutoTyper needs an active DOM target to type into.

#### Q: The extension says "Clipboard access was denied".
- **Answer:** In modern browsers, reading the clipboard from hotkeys requires clipboard permission. Open the extension popup from your browser toolbar and click **Auto-Type Clipboard** once to grant permission.

#### Q: A snippet started typing and it's too long. How do I stop it?
- **Answer:** Tap **`Escape`** on your keyboard or click the red **`Stop`** button on the floating HUD.

#### Q: Can I use AutoTyper while screen sharing?
- **Answer:** Yes! Turn on **Human Speed (75 WPM)** with **35% Jitter** and **Mechanical Sounds**. You can tap **`Alt + M`** occasionally to make realistic typos that correct themselves, making it look 100% like real-time typing.

#### Q: My code editor indents too far when typing code.
- **Answer:** Make sure you are using AutoTyper Pro **v1.2.1** or newer. It features smart indentation reconciliation that detects the editor's auto-indentation and skips redundant whitespace automatically.
