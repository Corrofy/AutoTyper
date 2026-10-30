# AutoTyper Pro — Fixes Applied

This document records every issue found in the audit and the fix applied. Items are ordered by severity. The implementation status is tracked at the bottom.

---

## P0 — Blockers

### P0-1. Missing `interpolateTags` crashed every typing action

- **File:** `src/utils/extensionGenerator.ts` (generated `content.js`)
- **Problem:** `typeSnippet()` called `interpolateTags(text)` but the function was never defined. Generated `content.js` threw `ReferenceError: interpolateTags is not defined` on every clipboard/snippet/paste/hotkey action. Callers did not await the async function, so the failure was silent.
- **Fix:** Added a full `interpolateTags()` implementation before `typeSnippet()`. It supports `{{date}}`, `{{time}}`, `{{weekday}}`, `{{month}}`, `{{year}}`, `{{timestamp}}`, `{{name}}`, `{{email}}`, and `{{ticket_id}}`, matching the web engine.
- **Hardening:** `typeSnippet()` now validates the target, focuses it, and wraps execution so failures are logged instead of silently swallowed.

### P0-2. Missing `openSnippetPalette` / `renderPaletteResults`

- **File:** `src/utils/extensionGenerator.ts` (generated `content.js`)
- **Problem:** The `Alt+K` handler and the `OPEN_SNIPPET_PICKER` message called `openSnippetPalette()`, which was never defined.
- **Fix:** Restored the full in-page snippet palette: search input, keyboard navigation, click selection, escape/backdrop close, and result rendering.
- **Focus fix:** The palette now captures the editable element that was focused before the palette opened and restores focus to it before typing. Previously the palette search input remained focused, so `getActiveEditable()` returned the palette input and text was typed into the palette instead of the page.
- **Empty state:** Shows a "No snippets found" message instead of an empty panel.

### P0-3. Manifest referenced an icon that was never generated

- **Files:** `src/utils/extensionGenerator.ts`, `scripts/build-extension.ts`, `src/types/extension.ts`
- **Problem:** The manifest declared `icons/icon128.png`, but only `icons/icon.svg` was emitted. Chrome/Edge/Brave refuse to load an unpacked extension with a missing icon.
- **Fix:** Added real PNG assets at 16, 32, 48, and 128 px as base64 data in `src/data/iconAssets.ts`. The generator now emits `icons/icon16.png`, `icon32.png`, `icon48.png`, and `icon128.png`, and the manifest declares both a top-level `icons` map and `action.default_icon`.
- **Binary pipeline:** `GeneratedExtensionFile` gained an optional `encoding: 'utf8' | 'base64'` field. The build script decodes base64 before writing, and the ZIP export passes `{ base64: true }` to JSZip. The code viewer shows a placeholder for binary assets instead of dumping base64.
- **Build guard:** The build script validates that every file referenced by the manifest actually exists in the generated package and fails the build otherwise.

### P0-4. Cascading indentation blowout in Code Editors

- **Files:** `src/utils/autoTyperEngine.ts`, `src/utils/extensionGenerator.ts` (`contentJs`)
- **Problem:** When typing multiline code into web code editors (Monaco Editor, CodeMirror 5/6, Ace Editor, or IDE textareas), inserting a newline character causes the editor's auto-indentation rule (`TypeWithAutoIndentCommand` / `newlineAndIndent`) to automatically insert leading spaces/tabs on the new line. AutoTyper then typed the snippet's leading whitespace on top of the editor's auto-indent, causing each consecutive line to shift further right in a cascading triangular blowout (+4, +8, +12, +16 spaces).
- **Fix:** Added **Smart Indentation Reconciliation** (`getActiveLineLeadingIndent`): After typing `\n`, the engine detects the indentation already provided by the editor. If the snippet's next line starts with identical indentation, the engine skips typing those duplicate whitespace characters.

### P0-5. Background timer throttling and focus loss desynchronization on tab/window blur

- **Files:** `src/utils/autoTyperEngine.ts`, `src/utils/extensionGenerator.ts` (`contentJs`, `contentCss`), `src/types/extension.ts`, `src/components/ConfigTab.tsx`, `src/App.tsx`
- **Visual Reference:** `screenshots/focusIssue.png`
- **Problem:** When the user switched browser tabs or minimized the window during an active typing session, browsers throttled background timers (`setTimeout` delayed to 1000ms+), and the target element in the page lost DOM focus. AutoTyper continued firing synthetic keystrokes and `execCommand` into an unfocused target or `document.body`. When the tab regained focus, characters were dropped, caret jumped, and typing suddenly resumed into whatever random element was clicked. Furthermore, elapsed time accumulated while backgrounded, corrupting WPM calculations.
- **Fix:**
  - Added **Automatic Focus-Loss Detection & Auto-Pause**: Registered `visibilitychange`, `window.blur`, and `window.focus` listeners during active typing sessions. When `document.hidden` becomes true or the window blurs, the session freezes immediately (`pausedDueToFocusLoss = true`).
  - Added **Re-anchoring & Smooth Resume**: When the tab regains visibility/focus, the engine re-focuses the target editable element (`focusEditable(target)`), restores the caret, allows a 150ms DOM stabilization delay, and resumes typing seamlessly from the exact character index where it was interrupted.
  - Added **Accurate WPM Calculation**: Excluded all paused duration (`totalPausedMs`) from elapsed time calculations so speed metrics remain strictly accurate.
  - Added **Floating HUD Pause/Resume Control & Hotkey**: Added a responsive Pause/Resume toggle button to the floating HUD (`#at-hud-pause`), dynamic title indicators (`Paused (Tab Inactive)` / `Paused`), and a configurable keyboard shortcut (`Alt+P`).

### P0-6. On-Page Typing Break (Pause/Play) and Live Speed Control

- **Files:** `src/utils/autoTyperEngine.ts`, `src/utils/extensionGenerator.ts` (`contentJs`, `contentCss`, `options.html`, `options.js`), `src/components/TypingHUD.tsx`, `src/App.tsx`, `src/components/ConfigTab.tsx`
- **Problem:** Users could not take breaks during long auto-typing sessions, nor could they adjust typing speed on the fly without navigating away to the settings page and cancelling their current typing session.
- **Fix:**
  - Added **Direct In-Page Speed Controls**: Embedded real-time speed steppers (`[-] WPM [+]`) and a one-click `⚡ Turbo` toggle directly on the floating HUD in both the browser extension content script and the web simulator. Speed changes immediately take effect on the very next keystroke calculation.
  - Added **On-Page Speed Shortcuts**: Bound `Alt+[` to decrease speed by 10 WPM and `Alt+]` to increase speed by 10 WPM live on any active web page without needing to touch the mouse.
  - Added **Interactive Pause & Break Mode**: Prominent Pause / Play button with clear visual states (`⏸ Pause` vs pulsing emerald `▶ Resume`), display of paused break status, and `Alt+P` keyboard shortcut to freeze and resume at any moment. Excludes pause break duration from WPM metrics.

### P0-7. Destructive backspacing and active line detection errors in Code Editors

- **Files:** `src/utils/autoTyperEngine.ts`, `src/utils/extensionGenerator.ts` (`contentJs`)
- **Visual Reference:** `screenshots/normal.png`, `screenshots/errorBegins.png`, `screenshots/lotsOfErrors.png`, `screenshots/actualsnippet.txt`
- **Problem:**
  - In `errorBegins.png`, typing `struct Rectangle {\n    int w,h;\n};` resulted in `int};` on line 8 because whenever a snippet line had less indentation than the editor's auto-indentation (e.g. at closing braces `};` or unindented lines), the engine calculated an `excess` and sent `KeyboardEvent('keydown', Backspace)` + `document.execCommand('delete')`.
  - Sending Backspaces across lines deleted the newline character, backspaced into the previous line, and erased code backwards (deleting `\n`, `;`, `h`, `,`, `w`, `' '` back to `int`), then typed `};` right after `int` on line 8 (`errorBegins.png`).
  - In subsequent lines (`lotsOfErrors.png`), repeated backspaces erased previous lines (`{`, `int w,h;\n};`, `cin >> rects[i].w >> ...`), merging lines together into a malformed mess.
  - In `getActiveLineLeadingIndent`, `el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement` ran before Monaco/CodeMirror checks. In Monaco, `el` is `<textarea class="inputarea">`, so it read Monaco's internal IME buffer instead of the actual editor line.
  - `isNextCharInEditor` and `stepOverChar` also queried Monaco's internal textarea instead of the editor model, causing characters from the snippet to be dropped and leaving duplicate closing braces.
- **Fix:**
  - Removed all destructive Backspace logic on Enter: AutoTyper NEVER sends Backspaces to "unindent" after a newline. Code editors naturally de-indent closing braces (like `}`) via electric indentation without eating previous lines.
  - Prioritized Monaco Editor (`.monaco-editor`), CodeMirror 6 (`.cm-editor`), CodeMirror 5 (`.CodeMirror`), and Ace Editor (`.ace_editor`) detection before generic HTML textarea checks.
  - Used bounding client rectangle geometry matching (`cursorRect.top` within `vlRect` vertical bounds) to accurately identify the active line in Monaco and CodeMirror.
  - Removed `isNextCharInEditor` / `stepOverChar` character skipping, allowing modern code editors' native `autoClosingOvertype` to handle closing delimiters faithfully.

---

## P1 — Major Functional Bugs

### P1-1. Download always exported Chrome

- **Files:** `src/App.tsx`, `src/components/ExportTab.tsx`
- **Problem:** `handleDownloadZip()` hardcoded `'chrome'`, ignoring the browser selected in the Export tab.
- **Fix:** The selected browser is lifted to `App` (`exportBrowser`) and passed to both the export preview and the download handler. The ZIP filename includes the target browser (`autotyper-pro-chromium.zip` / `autotyper-pro-firefox.zip`).

### P1-2. Clipboard reads were unreliable from the content script

- **Files:** `src/utils/extensionGenerator.ts` (background, content, popup, offscreen files)
- **Problem:** Clipboard hotkeys called `navigator.clipboard.readText()` in the page context, which is blocked by Permissions Policy, insecure origins, or lost user activation. Popup clipboard actions delegated the read back to the content script.
- **Fix:**
  - Added `READ_CLIPBOARD` handling in the background script.
  - Chromium builds include an offscreen document (`offscreen.html` / `offscreen.js`) with the `offscreen` + `clipboardRead` permissions for reliable clipboard access from the service worker.
  - Firefox reads from its background page (which has a DOM) with `clipboardRead`.
  - The content script tries the background first, then its own Clipboard API, then a legacy `execCommand('paste')` fallback.
  - The popup reads the clipboard directly while it is open and sends the resulting text to the tab, avoiding the content-script restriction entirely.
  - Clipboard failures now surface a HUD message instead of only a console warning.

### P1-3. "Type" actions only switched tabs

- **Files:** `src/App.tsx`, `src/components/SimulatorTab.tsx`, `src/components/PopupEmulatorModal.tsx`, `src/components/CommandPaletteModal.tsx`, `src/components/SnippetsTab.tsx`
- **Problem:** The popup preview, command palette, snippet library, and clipboard shortcut all navigated to the simulator but never started a session.
- **Fix:** Added an `AutoTypeRequest` hand-off. `App` creates a request with `{ id, text, title }`; `SimulatorTab` consumes it once, selects the target field, and starts the session automatically. Per-snippet hotkeys, snippet "Play", popup preview, palette selection, and the clipboard shortcut now all start typing immediately.

### P1-4. Extension shortcut recorder accepted bare keys

- **File:** `src/utils/extensionGenerator.ts` (generated `options.js`)
- **Problem:** Recording `A` stored the shortcut `"A"`, so every plain `A` keypress on a page matched, was prevented, and started typing. The page became unusable for that key.
- **Fix:** The recorder now requires `Ctrl`, `Alt`, or `Meta`, or allows `Escape`, `Tab`, and `F1`–`F12`. Invalid attempts show an inline hint and keep the recorder listening. `Shift` alone is rejected for printable keys.

### P1-5. Extension ignored most typing settings

- **File:** `src/utils/extensionGenerator.ts` (generated `content.js` and `options.*`)
- **Problem:** The extension ignored `speedMode`, `baseDelayMs`, `antiPasteBypass`, `soundFeedback`, and `soundVolume`.
- **Fix:**
  - Added `calculateCharacterDelay()` to the content engine, honoring `human`, `steady`, `turbo`, and `custom` modes plus jitter and punctuation pauses.
  - `antiPasteBypass: false` now suppresses synthetic keyboard events and only inserts text (still character-by-character).
  - Added optional WebAudio key-click feedback using `soundFeedback` and `soundVolume`.
  - Added options-page controls for speed mode, base delay, anti-paste bypass, keyboard sound, and volume.

### P1-6. Firefox context menus used a callback with the promise API

- **File:** `src/utils/extensionGenerator.ts` (generated `background.js`)
- **Problem:** `browser.contextMenus.removeAll(() => {...})` does not invoke the callback in Firefox's promise-based API, so menus were never registered.
- **Fix:** Context menu registration is now an `async` function that `await`s `removeAll()` before creating menus. Menus are rebuilt whenever stored snippets change, fixing stale menu entries (also P2-5).

### P1-7. Shortcut mismatch and duplicate triggers

- **File:** `src/utils/extensionGenerator.ts`
- **Problem:** The manifest command used `Alt+Shift+K` while the UI/content used `Alt+K`. Commands and content keydown listeners also handled the same shortcut twice, cancelling and restarting sessions. In `all_frames` builds this could double-fire.
- **Fix:** Removed the duplicate manifest `commands` block. The content script is now the single source of truth for shortcut handling, using the values configured in settings. Generated README text was updated to match.

### P1-8. Content script was not idempotent

- **File:** `src/utils/extensionGenerator.ts` (generated `content.js`)
- **Problem:** The "inject on send failure" fallback re-injected `content.js` into every frame, adding duplicate listeners, HUDs, and message handlers. Repeated clicks could type the same text multiple times.
- **Fix:** Added `window.__autotyperProInjected` guard at the top of the IIFE. Re-injection now exits immediately.

---

## P2 — Correctness, Robustness, Polish

### P2-1. Duplicate `input` events in the web engine

- **File:** `src/utils/autoTyperEngine.ts`
- **Problem:** When `document.execCommand('insertText')` succeeded, the browser fired a native `input` event and the engine dispatched a second synthetic one.
- **Fix:** Synthetic `input` events are now dispatched only in the manual fallback branches. On `execCommand` success the native event is used.

### P2-2. Contenteditable typo/backspace corrupted text

- **File:** `src/utils/extensionGenerator.ts` (generated `content.js`)
- **Problem:** Typo insertion used `target.innerText += typoChar`, which appended at the end of the field, and the backspace fallback did nothing for contenteditable elements.
- **Fix:** Added caret-aware `insertTextAtCaret()` and `deleteCharBeforeCaret()` helpers using `Selection`/`Range`. They are used for both normal insertion and typo correction, and restore the caret afterwards.

### P2-3. `mistakeMode: 'disabled'` still allowed manual mistakes

- **Files:** `src/utils/autoTyperEngine.ts`, `src/utils/extensionGenerator.ts`
- **Problem:** "100% Flawless" only disabled automatic mistakes; the hotkey and HUD button still injected typos.
- **Fix:** `triggerManualMistake()` / `triggerMistake()` now ignore requests when the mode is `disabled`.

### P2-4. JSON import accepted malformed data

- **File:** `src/components/SnippetsTab.tsx`
- **Problem:** Any array was accepted, then `s.tags.forEach` / `s.tags.some` could throw and break the tab.
- **Fix:** Added a validator/normalizer that requires an array of objects with string `title` and `content`, supplies safe defaults for missing fields, filters non-string tags, validates the category, and reports a helpful error for invalid files.

### P2-5. Context menus went stale after snippet edits

- **File:** `src/utils/extensionGenerator.ts` (generated `background.js`)
- **Problem:** Menus were built only on install from baked-in defaults.
- **Fix:** Menus are rebuilt on every `snippets` storage change (debounced in practice by the options-page save flow).

### P2-6. Options page dereferenced missing elements

- **File:** `src/utils/extensionGenerator.ts` (generated `options.js`)
- **Problem:** Speed/mistake controls were accessed without null checks; template drift would throw before handlers were wired.
- **Fix:** Added existence checks and fallbacks for all speed/mistake/sound controls.

### P2-7. Dead code, unused imports, unused dependencies

- **Files:** multiple `src` files, `package.json`
- **Fix:**
  - Removed unused imports and variables (`React` default import in `App.tsx`, `isInput`, `Keyboard`, `Zap`, `Sparkles`, `Info`, `ExternalLink`, `Check`, `createExtensionZip`, `formData`).
  - Renamed the package to `autotyper-pro`.
  - Removed unused dependencies: `@google/genai`, `dotenv`, `express`, `@types/express`, `@types/jszip`.
  - Removed the leftover `.env.example` AI Studio template.
  - Left `bun.lock` intact to avoid breaking an existing Bun workflow; `npm install` also works (no `package-lock.json` yet).

### P2-8. Misleading unused input check

- **File:** `src/App.tsx`
- **Problem:** `isInput` was computed with a comment about not hijacking typing but never used.
- **Fix:** Removed the unused variable and comment. Shortcut matching already requires modifiers, so page typing is unaffected.

### P2-9. Web engine contenteditable caret and backspace parity

- **File:** `src/utils/autoTyperEngine.ts`
- **Problem:** Caret-aware insertion and deletion were added to generated `content.js` in P2-2, but `autoTyperEngine.ts` (the web simulator engine) still used an empty fallback for `el.isContentEditable` backspaces and lacked caret-aware `<br>` and text node deletion.
- **Fix:** Implemented `focusElement()`, caret-aware `<br>` insertion, and Range/Selection-based backspacing in `autoTyperEngine.ts`.

### P2-10. Web engine ignored `antiPasteBypass: false`

- **File:** `src/utils/autoTyperEngine.ts`
- **Problem:** The simulator session always emitted synthetic keyboard events (`keydown`, `keypress`, `keyup`), ignoring the `antiPasteBypass` toggle.
- **Fix:** Guarded keyboard event dispatches behind `const emitKeyEvents = settings.antiPasteBypass !== false;`.

### P2-11. Web app recorder allowed Shift+printable shortcuts

- **Files:** `src/utils/shortcutHelper.ts`, `src/components/ShortcutRecorder.tsx`
- **Problem:** `formatKeyboardEvent` accepted `Shift+A`, `Shift+1`, etc. without Ctrl/Alt/Meta. Any recorded Shift+key combination hijacked normal typing of capital letters.
- **Fix:** Required `Ctrl`, `Alt`, or `Meta` for printable characters; Shift alone is rejected. Added inline visual feedback ("Add Ctrl, Alt, or Meta") in `ShortcutRecorder`.

### P2-12. Extension options page could not clear assigned shortcuts

- **File:** `src/utils/extensionGenerator.ts` (options.js)
- **Problem:** Once a snippet or global shortcut was set, pressing Backspace/Delete prompted "Add Ctrl / Alt / Meta" with no way to remove the shortcut.
- **Fix:** Allowed `Backspace` or `Delete` during recording to clear the shortcut back to empty / `None`.

### P2-13. Simulator did not intercept paste when `autoTypeOnPaste` was enabled

- **File:** `src/components/SimulatorTab.tsx`
- **Problem:** The anti-paste field blocked paste unconditionally and the other fields pasted natively, preventing users from testing the auto-type paste intercept feature.
- **Fix:** Added `handlePaste` to all simulator fields. When `settings.autoTypeOnPaste` is enabled, pasting intercepts the clipboard text and launches an auto-typing session.

### P2-14. Simulator lacked quick trigger expansion

- **File:** `src/components/SimulatorTab.tsx`
- **Problem:** Abbreviation triggers (like `:sig` + Tab/Space/Enter) worked in the extension but could not be tested inside the simulator fields.
- **Fix:** Added `handleTargetKeyDown` on simulator text fields to match trigger prefixes and auto-expand matching snippets.

### P2-15. Snippets JSON export used data URI with URL length limit

- **File:** `src/components/SnippetsTab.tsx`
- **Problem:** `data:text/json;charset=utf-8,` data URIs fail in browsers for large JSON payloads.
- **Fix:** Replaced with `new Blob(...)` and `URL.createObjectURL(blob)`.

### P2-16. Peer dependency conflict on `npm install`

- **File:** `package.json`
- **Problem:** `package.json` pinned `"esbuild": "^0.25.0"`, causing `npm install` to fail with `ERESOLVE` against Vite 8 peer requirements.
- **Fix:** Updated `"esbuild"` to `"^0.28.0"`.

---

## Verification

- `tsc --noEmit` (strict + noUnusedLocals/noUnusedParameters) — must pass after fixes.
- `vite build` — must pass.
- `tsx scripts/build-extension.ts` — generates all packages and validates manifest references.
- `node --check` on every generated JS file.
- Runtime VM harness to confirm `AUTO_TYPE_TEXT` no longer throws and actually reaches the typing loop.
- Assert generated manifests reference only files that exist.

## Implementation Status

- [x] P0-1 missing `interpolateTags`
- [x] P0-2 missing snippet palette + focus restore
- [x] P0-3 PNG icons + binary pipeline + manifest guard
- [x] P0-4 smart code indentation reconciliation
- [x] P0-5 background timer throttle & tab focus loss auto-pause / refocus
- [x] P0-6 on-page typing break (pause/play) and live speed controller
- [x] P0-7 destructive backspacing and active line detection errors fix
- [x] P1-1 export browser selection
- [x] P1-2 clipboard via extension context/offscreen
- [x] P1-3 Type actions start typing
- [x] P1-4 recorder modifier guard
- [x] P1-5 speed/anti-paste/sound settings
- [x] P1-6 Firefox context menus
- [x] P1-7 duplicate shortcut triggers
- [x] P1-8 idempotent content script
- [x] P2-1 duplicate input events
- [x] P2-2 contenteditable caret handling
- [x] P2-3 disabled mistake mode
- [x] P2-4 JSON import validation
- [x] P2-5 context menu refresh
- [x] P2-6 options null guards
- [x] P2-7 cleanup
- [x] P2-8 unused input check
- [x] P2-9 web engine contenteditable caret and backspace parity
- [x] P2-10 web engine ignored antiPasteBypass
- [x] P2-11 web app recorder Shift+printable shortcut rejection
- [x] P2-12 extension options shortcut clearing
- [x] P2-13 simulator auto-type on paste intercept
- [x] P2-14 simulator quick trigger expansion
- [x] P2-15 snippet export blob migration
- [x] P2-16 peer dependency resolution
