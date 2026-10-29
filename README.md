# Auto Typer

A browser extension that types a pasted snippet into whatever text field you have
focused, at a human speed and rhythm, with human-looking corrections.

It exists to test the **input side** of a detector built into a web editor: does
text that arrived as synthetic keystrokes get treated as human-authored? It says
nothing about whether an LLM-written document is caught by content heuristics.

**Status: M1.** Settings persist, the floating overlay is live and draggable,
messaging works, and the human-typing model is implemented and unit-tested
(44 tests: cadence, mistakes, keycode map, chord parsing). Nothing types into a
page yet — the dispatcher and the first adapter land in M2. See
[`plan.md`](plan.md) and [`docs/progress.md`](docs/progress.md).

---

## Install

Build the two packages (Node 20+, no `npm install` required):

```bash
node build.mjs
```

### Chromium (Chrome, Edge, Brave, Opera)

1. `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `dist/chromium`

### Firefox (128+)

1. `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Select `dist/firefox/manifest.json`

Temporary add-ons disappear when Firefox restarts; load it again after a restart.
There is no AMO signing step in v1.

Ready-made archives are also written to `dist/auto-typer-chromium.zip` and
`dist/auto-typer-firefox.zip` for sharing.

---

## What works in this build

| Feature | State |
| --- | --- |
| Dual-browser MV3 packaging from one source tree | done |
| Settings storage, validation, migration hooks | done |
| Popup: snippet, WPM slider, mode, toggles, tab status | done |
| Floating overlay: shadow DOM, drag, collapse, enable switch | done |
| One writer for settings, frames reporting their focus target | done |
| Human cadence model: clipped Gaussian, pauses, bursts (44 unit tests) | done (M1) |
| Mistake planner: physical-neighbour slips + backspace recovery | done (M1) |
| Keycode map: full US layout, 95 printable ASCII + whitespace | done (M1) |
| Chord parser/matcher for recordable hotkeys | done (M1) |
| Dispatcher + textarea/input adapter | M2 |
| Contenteditable adapter | M3 |
| Monaco / CM6 / CM5 / Ace adapters | M4 |
| Hotkeys wired to the run state machine | M5 |
| Diagnostic panel | M6 |

---

## Permissions, stated plainly

| Permission | Why |
| --- | --- |
| `<all_urls>` + `all_frames` | The extension must run wherever you want to type, including editors inside iframes |
| `storage` | Your snippet and settings, stored locally |
| `tabs` | The popup needs to know which tab/frame you are in |
| `scripting` | Re-inject into tabs that were already open when you installed or reloaded |

There are **no network requests**, no analytics, and nothing leaves your machine.
`<all_urls>` also means the extension *can* observe typed content on any site —
that is the cost of "types anywhere", and it is why this is a local-only tool.

---

## Development

```bash
node tools/check-syntax.mjs   # parse every file + verify manifest script order
node build.mjs                # dist/chromium + dist/firefox + zips
node build.mjs --no-zip       # faster while developing
npm test                      # 44 unit tests, no browser needed
node tools/timeline.mjs       # print the cadence: delays, reasons, histogram
node tools/timeline.mjs --wpm 48 --chars 60 --seed 7
node tools/timeline.mjs --text "const x = 1;" --no-pause
node tools/e2e.mjs            # real Firefox run of the fixture probe
E2E_PAGE=react.html node tools/e2e.mjs
```

`timeline.mjs` runs the shipped `cadence.js` with a seed and prints one row per
keystroke (`char`, which previous character caused the pause, delay, cumulative
time, reason), then the mean/σ/range and a delay histogram. If a rhythm claim is
not visible there, it is not real.

The e2e harness serves `test/fixture/`, installs the extension with `web-ext run`,
and asserts what the page-side probe actually observed (focus retention, drag,
storage round-trip, render).

### Layout

```
src/manifest.base.json   shared manifest; build.mjs adds per-browser background
src/shared/              protocol (namespace, messages, API facade), theme
src/background/          message router, settings schema + storage
src/content/             bootstrap, focus tracker, overlay, hotkey chords
src/content/engine/      pure engine: cadence, mistakes, keycode map
src/popup/               popup UI
src/main-world/          (M4) page-world bridge for editor APIs
build.mjs                manifest generation + packaging
tools/                   icons, syntax gate, timeline, e2e harness
test/unit/               node:test suites for the pure engine
test/fixture/            browser fixtures + probe
```

## Known limitations

- Every event has `isTrusted === false`. A detector that checks that flag will see
  through this by design; only CDP-driven input would change that.
- Google Docs and other canvas-rendered editors are not supported.
- Firefox may need site access granted after install.
- The keycode map is **US layout only**. Characters still type correctly through
  `key`/`text`, but legacy `keyCode` values will not match a non-US keyboard.
- Typing into a page is not wired up yet; M2 adds the dispatcher and the first
  adapter. Hotkeys arrive in M5.

See [`plan.md` §10](plan.md) for the full list.
