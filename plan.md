# Auto Typer — Implementation Plan (v1)

A Manifest V3 browser extension that types a pasted code snippet into the focused
editable element of any web page, with a human-like cadence, so that an AI detector
integrated into an online code editor can be tested against synthetic-but-plausible
keyboard input.

Status tracking lives in [`docs/progress.md`](docs/progress.md). This file is the
design of record; `progress.md` records what is actually built.

---

## 1. Purpose and non-goals

**Purpose:** produce input that a web-based editor accepts as normal typing, at a
human speed, in a human rhythm, with human-looking corrections.

**Non-goals (v1):**

- Bypassing detectors that inspect `Event.isTrusted` (see §12 — impossible without CDP).
- Typing into Google Docs or other canvas-rendered editors.
- Cloud sync, accounts, telemetry, or any network request.
- Multi-snippet library, resume-after-reload (deferred; see §11).

---

## 2. Locked decisions

| Area | Decision |
| --- | --- |
| Platforms | Chromium (MV3 service worker) + Firefox ≥ 128 (MV3 event page) |
| Language | Plain JavaScript, classic scripts sharing one `AutoTyper` namespace, no runtime dependencies, no bundler (see §5.0) |
| Build | `build.mjs` (Node, zero deps) → `dist/chromium/`, `dist/firefox/`, two zips |
| Input path | Synthesized DOM events only; `isTrusted` remains `false` |
| Target editors | `textarea`/`input` (incl. React-controlled), `contenteditable`, Monaco, CodeMirror 6, CodeMirror 5, Ace |
| Primary target | Unknown — assume a **plain React `<textarea>`**; the interface may change |
| Start trigger | Select snippet → focus target field → hotkey starts |
| Insert mode | Insert at caret by default; optional replace-document behind a warning |
| Speed | Canonical unit = chars/min. UI shows WPM + CPS + ms/char. Hard clamp **30–50 WPM** (2.5–4.17 CPS, 240–400 ms/char), default 40 WPM |
| Cadence | Gaussian jitter σ = 25% of base, clipped 0.5×–2×; word/symbol/newline pauses; burst runs |
| Mistakes | 3% per letter, adjacent QWERTY key, 300–600 ms pause, backspace 1–3, retype correct |
| Hotkeys | In-page capture-phase listener; user-recordable chords |
| Blur | Active run pauses when the tab/window loses focus |
| Permissions | `storage`, `scripting`, `tabs`, host `<all_urls>`, `all_frames: true` |
| Firefox install | `about:debugging` temporary add-on only (no AMO signing in v1) |
| Diagnostics | Overlay "diagnostic mode": detected adapter, successful rung, event log |

---

## 3. Reality check — what "type everywhere" means

| Tier | Targets | Mechanism | Supported |
| --- | --- | --- | --- |
| A | `textarea`/`input`, search bars, Monaco, CodeMirror 5/6, Ace | Synthetic key sequence + adapter-applied text mutation | Yes, high confidence |
| B | Generic `contenteditable` (Google Keep, mail composers, note apps) | Focus + `execCommand('insertText')` per char | Yes, medium confidence (app-specific undo/formatting) |
| C | Google Docs, canvas editors, `chrome://`, Web Store, other extensions' pages | Would need trusted CDP input | **No** — out of scope |

Two verified platform facts this design depends on:

1. **Firefox MV3 has no service workers.** It runs a non-persistent event page
   (`background.scripts`). The build therefore emits a Firefox manifest using
   `scripts` and a Chromium manifest using `service_worker`.
2. **`"world": "MAIN"` content scripts** exist from Chrome 111 / Firefox 128.
   Required to reach page-owned editor instances (Monaco/Ace/CodeMirror), which the
   extension's isolated world cannot see.

---

## 4. Architecture

```
popup ──┐
        ├── runtime messages ──► background (router; sole owner of storage)
options ┘                            │
                                     │ tabs.sendMessage
                                     ▼
                    content script (one per frame, all_frames: true)
                    ├── focus-tracker.js    last editable element in THIS frame
                    ├── hotkeys.js          capture-phase chord matching
                    ├── engine/typist.js    state machine + scheduler
                    ├── injection/*         adapters + verification/escalation
                    ├── overlay/overlay.js  shadow-DOM widget (top frame only)
                    └── bridge-client.js ◄─► main-world/bridge.js
```

Rationale: the engine must run where the DOM and real focus are, so it lives in the
content script. Because keydown lands in the *focused* frame, that frame starts the
run — no cross-frame guessing. The background never holds a timer, so MV3 worker
suspension cannot corrupt a run.

### File tree (target)

```
auto_typer/
├── plan.md
├── docs/
│   └── progress.md
├── README.md
├── build.mjs
├── package.json                  # scripts only, no deps
├── tools/
│   ├── make-icons.py             # regenerates src/icons (Pillow, run manually)
│   ├── check-syntax.mjs          # parse every shipped file + manifest order gate
│   └── e2e.mjs                   # real-browser acceptance run (web-ext + probe)
├── src/
│   ├── manifest.base.json
│   ├── icons/                    # 16 / 32 / 48 / 128 png
│   ├── background/
│   │   ├── background.js         # router, lifecycle, install/update
│   │   ├── settings.js           # schema, defaults, validation, migration
│   │   └── tabs.js               # ensure-injected, frame targeting
│   ├── content/
│   │   ├── content.js            # bootstrap + wiring
│   │   ├── focus-tracker.js
│   │   ├── hotkeys.js            # chord parse/match/capture
│   │   ├── engine/
│   │   │   ├── typist.js         # IDLE→ARMED→TYPING⇄PAUSED→DONE|STOPPED|ERROR
│   │   │   ├── cadence.js        # WPM↔ms, jitter, pause rules, bursts   (pure)
│   │   │   ├── mistakes.js       # QWERTY adjacency + correction sequence (pure)
│   │   │   └── keycode-map.js    # char → {key, code, keyCode, which, charCode, shift}
│   │   ├── injection/
│   │   │   ├── dispatcher.js     # event construction, native setter, execCommand
│   │   │   ├── detect.js         # editor detection + escalate-on-no-change loop
│   │   │   ├── bridge-client.js
│   │   │   └── adapters/
│   │   │       ├── textarea.js
│   │   │       ├── contenteditable.js
│   │   │       ├── monaco.js
│   │   │       ├── cm6.js
│   │   │       ├── cm5.js
│   │   │       └── ace.js
│   │   └── overlay/
│   │       ├── overlay.js
│   │       └── overlay.css
│   ├── main-world/
│   │   └── bridge.js             # guarded access to monaco/ace/CodeMirror globals
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── options/
│   │   ├── options.html
│   │   ├── options.js
│   │   └── options.css
│   └── shared/
│       ├── messages.js
│       ├── constants.js
│       ├── qwerty.js
│       └── theme.css
└── test/
    ├── fixture/
    │   ├── index.html            # harness chooser
    │   ├── probe.js              # page-side acceptance probe (?probe=1)
    │   ├── smoke.html            # plain textarea / input / contenteditable
    │   ├── react.html            # controlled React 18 + React 19 variants
    │   ├── contenteditable.html
    │   ├── cm6.html
    │   ├── cm5.html
    │   ├── ace.html
    │   └── monaco.html
    └── unit/
        ├── cadence.test.js
        ├── mistakes.test.js
        ├── keycode-map.test.js
        └── hotkeys.test.js
```

---

## 5. The hard parts and their solutions

### 5.0 Module strategy — classic scripts, not ES modules

The first draft of this plan said "ES modules". That is not implementable as
stated, and the reason is worth recording because it shapes every file:

- **Declarative content scripts cannot be ES modules** in either browser
  (`content_scripts.js` has no `type` field).
- **The usual workaround is unsafe.** A loader that dynamic-imports a module graph
  hits Chrome 130+ bugs where inter-module imports from a content script fail, and
  Firefox has a long-standing behavior where the *page's* CSP is applied to
  extension module fetches.
- **The remaining option is a bundler**, which contradicts the zero-build,
  zero-dependency goal.

Decision: every shipped file is a classic IIFE that attaches to a single
`AutoTyper` namespace, with load order declared in the manifest
(`content_scripts.js`, `background.scripts`, or `<script>` tags). Chromium's
service worker pulls its siblings in with `importScripts()`.

Consequences, stated plainly:

| Cost | Mitigation |
| --- | --- |
| No `import`/`export`; ordering matters | Order is declared in exactly two places, and `tools/check-syntax.mjs` + `build.mjs` both fail on drift |
| Globals inside the content world | One namespaced object, invisible to the page (isolated world) |
| No tree shaking | Nothing to shake; ~40 KB total |

Upside that matters here: the same file runs in the service worker, the Firefox
event page, the content script and the popup, and Node tests `require()` the exact
shipped file, so tests cannot drift from production.

### 5.1 Event fidelity

`new KeyboardEvent('keydown', { keyCode: 65 })` yields `keyCode: 0`: the legacy
fields are not in the init dictionary. The dispatcher constructs the event with
standard fields, then `Object.defineProperty`s `keyCode`, `which`, and `charCode`
onto the instance.

Printable char sequence: `keydown → keypress → (text mutation) → input → keyup`.
Special keys: `keydown → keyup` (plus `beforeinput` where the target consumes it).
All events: `bubbles: true, cancelable: true, composed: true`.

### 5.2 Synthetic keystrokes do not insert text

An untrusted `keydown` notifies listeners but the browser never edits the field.
Every printable character must therefore be applied by the adapter, while the event
sequence exists to feed the page's model and undo stack. This is the reason an
adapter layer is unavoidable.

### 5.3 Adapter ladder with verification

For each character:

1. Dispatch the key sequence, then wait up to 120 ms for a change signal
   (`input` / `selectionchange`).
2. No change → `document.execCommand('insertText', false, ch)`.
3. No change → adapter fallback through the MAIN-world bridge
   (Monaco `editor.trigger`, Ace `session.insert`, CM6 `view.dispatch`, CM5
   `replaceSelection`).
4. Still nothing → mark the target unsupported, stop cleanly, report in the overlay.

The winning rung is cached per element and re-validated when the target changes.
This is how one engine honestly covers five different internal editor models, and
how an *unknown* editor degrades predictably instead of silently failing.

### 5.4 React-controlled inputs

Assigning `.value` trips React's internal value tracker, so `onChange` never fires.
Use the prototype's native setter before dispatching `input`:

```js
const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
setter.call(el, nextValue);
el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
```

Also yield to the event loop between characters so React's async re-render does not
race the next mutation. The 240–400 ms cadence supplies that yield for free.

### 5.5 Caret and selection

Adapters expose `getSelection()` / `setSelection()`. Hidden-textarea editors get the
textarea focused and `selectionStart/End` set before each character; Monaco and CM6
go through the bridge. Replace-document mode is per-adapter (`Ctrl+A` sequence, then
type) and gated behind a popup confirmation.

### 5.6 Cadence math

Canonical unit is chars/min: `cpm = WPM × 5`.

| WPM | CPS | ms/char |
| --- | --- | --- |
| 30 | 2.50 | 400 |
| 40 | 3.33 | 300 |
| 50 | 4.17 | 240 |

Per-character delay = `gaussian(μ = 60000 / cpm, σ = 0.25μ)`, clipped to
`[0.5μ, 2μ]`. Pause multipliers: after space ×1.2–2.2; after `; , ) } ]` ×1.5–3;
after newline ×4–8; 8% chance of a 3–8 char burst at ×0.6.

### 5.7 Mistake engine

Per letter, p = 0.03: pick an adjacent QWERTY key, type it, pause 300–600 ms,
backspace 1 (occasionally 2–3 when a cluster was typed), retype the correct
character. Toggleable mid-run by hotkey.

### 5.8 Focus model

Each frame tracks `lastFocusedEditable` via capture-phase `focusin` plus a
`MutationObserver` sanity check, so clicking the overlay does not lose the target.
The overlay lives in the top frame and talks to whichever frame is running.

### 5.9 Scheduler and state machine

Sequential `setTimeout` chain with a generation token; stop/pause invalidates
in-flight work immediately.

```
IDLE ──arm──► ARMED ──start──► TYPING ⇄ PAUSED ──► DONE
                                  │                 │
                                  └──► STOPPED ◄────┘
                                          ERROR
```

Run state is mirrored to `chrome.storage.session` so the popup can display progress
without keeping the worker alive.

---

## 6. Configuration schema

```js
{
  version: 1,
  enabled: false,
  snippet: { text: "", filename: null },
  mode: "insert",                 // "insert" | "replace"
  speed: { wpm: 40 },             // clamped 30..50; UI shows cps + ms/char
  jitter: { enabled: true, sigma: 0.25, minFactor: 0.5, maxFactor: 2.0 },
  pauses: { word: true, symbol: true, newline: true, burstChance: 0.08 },
  mistakes: { enabled: true, rate: 0.03, minPauseMs: 300, maxPauseMs: 600 },
  hotkeys: {
    startStop:     "Alt+Shift+Space",
    pauseResume:   "Alt+Shift+P",
    toggleEnabled: "Alt+Shift+E",
    speedUp:       "Alt+Shift+ArrowUp",
    speedDown:     "Alt+Shift+ArrowDown",
    toggleMistakes:"Alt+Shift+M"
  },
  overlay: { visible: true, x: 24, y: 24, collapsed: false },
  behavior: { pauseOnBlur: true, countdownMs: 0, diagnostics: false }
}
```

Stored in `chrome.storage.local` (snippets exceed the `sync` 8 KB/item cap). The
options page renders from the schema, so adding a knob is a one-line change.

---

## 7. Milestones

Each milestone ends with: a working increment loadable in both browsers, an
acceptance check performed, and an entry appended to `docs/progress.md`.

### M0 — Skeleton

Dual manifests, `build.mjs`, settings layer, popup shell, content bootstrap,
shadow-DOM overlay, enable toggle.

*Acceptance:* loads unpacked in Chrome and Firefox; overlay renders, drags, and
remembers position; no console errors.

### M1 — Pure engine

`cadence.js`, `mistakes.js`, `keycode-map.js`, `hotkeys.js` parsing, plus unit tests.

*Acceptance:* `node --test` green; timeline dump at 30/40/50 WPM produces plausible,
distribution-checked delays; mistake sequences are well-formed.

### M2 — Textarea / input adapter (primary target)

Native-setter mutation, newline + indentation handling, insert/replace modes,
React 18 and React 19 fixtures.

*Acceptance:* a 30-line snippet types correctly into the plain fixture textarea, the
controlled React textarea, and a real search box; `onChange` fires with the full
text; undo groups sanely.

### M3 — Contenteditable adapter

*Acceptance:* types correctly into a Keep-style editable div, preserving spaces and
not duplicating characters at boundaries.

### M4 — Editor adapters + verification ladder

Monaco, CodeMirror 6, CodeMirror 5, Ace, MAIN-world bridge, escalation and
unsupported-target reporting.

*Acceptance:* identical snippet lands correctly in all four fixtures; forcing a rung
to fail escalates as designed; unsupported target reports cleanly instead of hanging.

### M5 — Hotkeys, overlay controls, state machine

All six chords, overlay buttons, speed and mistake toggles mid-run, pause-on-blur.

*Acceptance:* every chord works in every fixture; speed change applies to the next
character; blur pauses and refocus resumes from the same index.

### M6 — Cadence and mistake tuning, diagnostics

Statistical sanity pass, ETA/progress readout, diagnostic mode panel.

*Acceptance:* measured CPS within ±15% of target over 1000 characters; observed
mistake rate within ±1 point of configured; diagnostic panel identifies adapter and
rung for each fixture.

### M7 — Packaging and documentation

Two zips, README (install, permissions, limitations, troubleshooting), architecture
notes.

*Acceptance:* clean Chrome profile installs from zip and types into the fixture; clean
Firefox profile loads the temporary add-on and does the same.

---

## 8. Testing strategy

- **Unit (`node:test`, no deps):** pure modules only — cadence, mistakes, keycode
  map, chord parser. Deterministic via injectable RNG. Tests `require()` the same
  files that ship, so a bundling step can never hide a divergence.
- **Fixture harness (`test/fixture/`):** hand-driven pages for each editor, loaded
  over a static server. Monaco/CM/Ace via CDN.
- **Automated acceptance (`tools/e2e.mjs`):** serves the fixture, launches the
  browser with the extension via `web-ext run`, and lets the page's own probe
  (`test/fixture/probe.js`) drive the real widget with synthetic pointer events,
  then reports what it observed over HTTP. Assertions run in Node.
  This catches the class of failure that manual clicking misses: focus theft,
  a storage round-trip that silently no-ops, a render that never repaints.
- **Manual acceptance scripts:** each milestone's acceptance check is a written
  procedure in `docs/progress.md`, not a vibe.
- **No e2e framework in v1.** Playwright stays a deliberate later decision.

---

## 9. Permissions and privacy

| Permission | Why |
| --- | --- |
| `storage` | Settings and snippet |
| `scripting` | Re-inject after navigation |
| `tabs` | Find the active tab for popup-initiated runs |
| `<all_urls>`, `all_frames: true` | Type on any site; hotkeys work without a prior click |

No network requests. No analytics. The README must state plainly that the extension
can observe typed content on all sites, because that is what `<all_urls>` means.

---

## 10. Known limitations

1. `isTrusted === false` on every event. A detector that checks the flag will flag
   this. Not fixable within this architecture.
2. Google Docs, canvas editors, `chrome://` pages, the Web Store, and other
   extensions' pages are unsupported.
3. Firefox may require granting site access after install; the extension detects
   missing access and shows instructions.
4. Firefox temporary add-ons reset on browser restart (accepted for v1).
5. Hotkey chords can be shadowed by OS/IME/page shortcuts; overlay buttons are the
   fallback.
6. Undo granularity differs per editor; long pauses encourage sane grouping but do
   not guarantee it.
7. Runs pause on blur — no background typing (background timers are throttled anyway).

---

## 11. Deliberately deferred

- Multi-snippet library with named snippets and search.
- Resume-after-reload (persist index + target fingerprint).
- CDP/`chrome.debugger` engine for trusted input (would cover Google Docs).
- Import from a URL/clipboard history, snippet variables.

Each is additive against the `InjectionStrategy` interface and the schema's
`version` field; none requires restructuring.

---

## 12. What this project does and does not test

This extension tests the **input side** of a detector: whether text that arrived as
synthetic keystrokes is treated as human-authored. It says nothing about the
**content side** — whether an LLM-written document is detected by prose heuristics.
Both results are meaningful; conflating them produces wrong conclusions.

---

## 13. Working agreements

- Incremental delivery: one milestone at a time, concept explained before code.
- `plan.md` changes only when a decision changes; the change is noted in
  `docs/progress.md` under "Plan changes".
- `docs/progress.md` is append-only per milestone, with date, status, acceptance
  result, and what was learned.
- No dependency is added without a stated reason and a size/maintenance note.
