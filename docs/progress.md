# Auto Typer — Progress Log

Append-only record of what is actually built. Design of record: [`../plan.md`](../plan.md).

**Rule:** after each milestone — and after any meaningful intermediate step — append an
entry. Never rewrite history; if something was wrong, add a correction entry. The
"Current status" block is the only section that gets edited in place.

---

## Current status

- **Phase:** M1 complete (M0's Chromium load-unpacked check still outstanding)
- **Active milestone:** M2 — textarea/input adapter incl. React-controlled
- **Blocked on:** nothing
- **Last updated:** 2026-10-29

| Milestone | Scope | Status |
| --- | --- | --- |
| M0 | Skeleton: dual manifests, build, settings, popup shell, overlay, enable toggle | DONE (1 manual check outstanding) |
| M1 | Pure engine: cadence, mistakes, keycode map, hotkey parser + unit tests | DONE |
| M2 | Textarea/input adapter incl. React-controlled (primary target) | NOT STARTED |
| M3 | Contenteditable adapter | NOT STARTED |
| M4 | Monaco / CM6 / CM5 / Ace adapters + verification ladder | NOT STARTED |
| M5 | Hotkeys, overlay controls, state machine, pause-on-blur | NOT STARTED |
| M6 | Cadence + mistake tuning, diagnostics, progress/ETA | NOT STARTED |
| M7 | Packaging, README, architecture notes | NOT STARTED |

Status vocabulary: `NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `DONE` · `DEFERRED`

---

## Entry template

Copy this block for each new entry, newest at the bottom.

```markdown
## YYYY-MM-DD — Mx — <short title>

**Status:** IN PROGRESS | DONE | BLOCKED
**Files touched:** `path/a.js`, `path/b.js`

### What was built
- ...

### Acceptance check
- [ ] Criterion from plan.md §7
- Result: PASS / FAIL / PARTIAL — what was observed, not what was intended.

### Decisions made
- ... (why this shape, what alternative was rejected)

### What was learned
- Concepts exercised and what the implementation revealed about them.

### Open issues / follow-ups
- ...
```

---

## 2026-10-29 — Planning — Scope and architecture locked

**Status:** DONE
**Files touched:** `plan.md`, `docs/progress.md`

### What was built
- Requirements interviews resolved every ambiguity that affected architecture.
- `plan.md` written as the design of record (14 sections).
- This file created as the append-only build log.

### Decisions made
- **DOM event engine only** for v1. `isTrusted` stays false; CDP deferred.
  Rationale: content-script synthesis covers every target the user named except
  canvas editors, without a persistent debugger banner or a scary permission.
- **Firefox supported** via a separate manifest target (event page, not service
  worker — Firefox MV3 has no service workers).
- **Primary target assumed to be a plain React `<textarea>`**, because the detector's
  interface is unknown and may change. This makes M2 the real acceptance gate, and
  makes the "unknown editor → generic adapter" path the most important one.
- **Speed clamp 30–50 WPM** (240–400 ms/char), canonical unit chars/min, with WPM,
  CPS, and ms/char shown in sync. The user's original 40–150 ms range was rejected as
  physically inconsistent with 30–50 WPM; WPM won.
- **Insert at caret by default**; replace-document is opt-in behind a warning.
- **Firefox distribution = `about:debugging` temporary install.** No AMO signing in
  v1, but `browser_specific_settings.gecko.id` is kept so signing stays possible.
- **Cut from v1:** multi-snippet library, resume-after-reload. Kept: single snippet
  buffer, file import, overlay, six hotkeys.
- **Verification/escalation ladder** in the injection layer (key sequence → execCommand
  → MAIN-world API → report unsupported). Adopted because it is the only honest way to
  claim multi-editor support *and* degrade predictably on an unknown editor.
- **Diagnostic mode in the overlay**, so an unfamiliar target can be diagnosed in
  seconds rather than by reading code.

### What was learned
- Synthetic `keydown` events never insert text; the adapter must apply the change and
  the events exist only to feed the page's model and undo stack.
- `keyCode`/`which`/`charCode` cannot be passed through the `KeyboardEvent` init
  dictionary and must be defined on the instance afterwards.
- React's `_valueTracker` means a naive `.value` assignment leaves `onChange` silent;
  the prototype native setter is required.
- Firefox MV3 runs an event page; `"world": "MAIN"` arrived in Firefox 128 / Chrome 111,
  which is what makes page-owned editor APIs reachable.

### Open issues / follow-ups
- Detector's actual editor is unknown; `test/fixture/react.html` must cover React 18
  and React 19 behaviours.
- Deprecated `execCommand` is used deliberately for contenteditable and as a
  fallback rung; document the reason in the README so it does not look like an oversight.

---

## 2026-10-29 — M0 — Skeleton, dual manifests, live overlay

**Status:** DONE (Firefox verified end-to-end; Chromium load-unpacked still needs one
manual confirmation because no Chromium binary exists on this machine)

**Files touched:** `build.mjs`, `package.json`, `.gitignore`, `README.md`,
`src/manifest.base.json`, `src/shared/protocol.js`, `src/shared/theme.css`,
`src/background/settings.js`, `src/background/background.js`,
`src/content/content.js`, `src/content/focus-tracker.js`,
`src/content/overlay/overlay.js`, `src/popup/{popup.html,popup.js,popup.css}`,
`src/icons/*`, `tools/{make-icons.py,check-syntax.mjs,e2e.mjs}`,
`test/fixture/{smoke.html,probe.js}`, `plan.md`, `docs/progress.md`

### What was built
- `build.mjs`: one source tree → `dist/chromium` (service worker) and
  `dist/firefox` (event page + gecko id), two zips, with manifest-reference
  validation and a content-script-order drift gate. No dependencies.
- `src/shared/protocol.js`: the `AutoTyper` namespace, message vocabulary,
  `{ok, data|error}` envelope, promise-aware `onMessage`, API facade
  (`browser` preferred, `chrome` fallback).
- `src/background/settings.js`: the full §6 schema, bounds enforcement,
  migration hook, debounced-safe `patch()`, `storage.onChanged` subscription.
- `src/background/background.js`: router, badge, per-frame report cache,
  on-demand `scripting.executeScript` for tabs that predate the install.
- `src/content/focus-tracker.js`: capture-phase `focusin`, keeps the last editable
  element across overlay clicks, refuses to target our own UI.
- `src/content/overlay/overlay.js`: shadow-DOM widget, `:host { all: initial }`,
  pointer drag with live clamping, collapse, enable switch, live WPM/CPS readout,
  progress meter, `prefers-reduced-motion` support.
- `src/content/content.js`: bootstrap, settings sync, serialised settings writes,
  debounced tab reports, boot markers for diagnostics and tests.
- `src/popup/*`: Dracula popup — snippet + `.js/.txt/...` import, char count,
  estimated duration, 30–50 WPM slider with cps/ms readout, insert/replace
  segmented control with warning, three cadence toggles, live tab/frame status,
  two-step reset.
- `tools/check-syntax.mjs`: parses every file, validates JSON, verifies manifest
  order and referenced files exist.
- `tools/e2e.mjs` + `test/fixture/{smoke.html,probe.js}`: real-browser acceptance
  harness (serves fixtures, installs via `web-ext run`, page drives the widget with
  synthetic pointer events, asserts in Node).

### Acceptance check
- [x] `node tools/check-syntax.mjs` → `check ok — 18 files parsed, manifest order verified`
- [x] `node build.mjs` → chromium 15 files / firefox 15 files, both zips produced
- [x] `web-ext lint dist/firefox` → **0 errors, 0 warnings, 0 notices**
- [x] `web-ext run` headless → `Installed … as a temporary add-on`
- [x] `node tools/e2e.mjs` → 10/10 PASS:
  - overlay mounted, shadow root + panel rendered
  - content boot marker `ok`, background reachable `ok`
  - live speed text `40 WPM · 3.33 cps`
  - clicking the widget does **not** steal focus
  - drag moved the widget `matrix(…, 24, 24)` → `matrix(…, 72, 56)`
  - enable round-trip: phase `disabled` → `ready` (overlay → background → storage → render)
  - collapse round-trip persisted
  - zero page errors
- [ ] Chromium: Load unpacked → **not verified on this machine** (no Chromium
      binary; `dist/chromium` is built, lint-equivalent and structurally identical)
- [ ] Manual: drag the widget, quit and reopen the popup, confirm the position and
      snippet persisted across a browser restart

### Decisions made
- **Classic scripts + one namespace instead of ES modules.** Forced by the platform:
  content scripts cannot be modules, the dynamic-import loader is broken on
  Chrome 130+ for module graphs and is CSP-sensitive in Firefox, and a bundler
  contradicts the zero-dependency goal. Recorded in `plan.md` §5.0.
- **Background is the only writer; everything reads storage directly.** Reads are
  cheap and always current; validation stays in one place.
- **`storage.onChanged` instead of broadcast messages** for settings sync. It cannot
  be missed by a frame that mounted late, and it costs no message traffic.
- **`undefined` return means "not my message".** `runtime.sendMessage` reaches every
  content script; without this rule a content script could win the race and answer a
  request addressed to the background.
- **Focus is deliberately not cleared on blur.** Clicking the overlay must not discard
  the field the user just clicked into; staleness is handled by checking
  `isConnected` at use time.
- **Boot markers on the widget host** (`data-boot`, `data-bg`) so both the e2e probe
  and a human can tell whether the content↔background loop closed.
- **`DOMParser` instead of `innerHTML`** for the overlay template: keeps `web-ext
  lint` at zero warnings and removes an escaping hazard if the template ever gains
  interpolated content.
- **Firefox `data_collection_permissions: {required: ["none"]}`** added now; AMO
  requires it from Firefox 140 onward, and it is a true statement about this build.
- **Icons generated once with Pillow into `src/icons/`**, not at build time, so the
  build stays dependency-free.

### What was learned
- `background.type: "module"` exists for Firefox event pages, but it is irrelevant
  here: the module restriction that actually bites is on *content scripts*, and it
  applies to both browsers.
- `web-ext run` has no `--headless` flag; pass it through `--args=-headless`.
- `setPointerCapture` throws on synthetic pointer ids, so pointer capture must be
  guarded for the drag to remain testable — and for the widget not to break on
  odd input devices.
- `innerHTML` is flagged by the add-on linter even for constant templates;
  `DOMParser` is the cheap, lint-clean alternative.
- Two layers of "did it work?" are needed: the install banner only proves the
  manifest parsed. The probe proved the *loop* (focus, drag, storage, render).

### Plan changes
- §2 Language and §5.0: ES modules → classic scripts + namespace (reason recorded).
- §8: added the automated `tools/e2e.mjs` probe harness to the testing strategy.
- File tree: added `tools/`, `src/icons/`, `test/fixture/probe.js`; replaced
  `test/fixture/textarea.html` with `smoke.html` (M0 scope).

### Open issues / follow-ups
- Chromium load-unpacked confirmation (needs a machine with Chromium).
- Popup width is fixed at 380 px; check at browser zoom 150 % in M5.
- `overlay.visible` and `behavior.diagnostics` are stored but have no UI yet
  (wired in M5/M6).
- `frameReports` is in-memory and lost when the worker is suspended; acceptable
  because frames re-report, but the popup can briefly show "reload the page" on a
  cold worker. Revisit if it is annoying in practice.

---

## 2026-10-29 — M1 — Pure engine: cadence, mistakes, keycode map, chords

**Status:** DONE

**Files touched:** `src/content/engine/{cadence.js,mistakes.js,keycode-map.js}`,
`src/content/hotkeys.js`, `test/unit/{cadence,mistakes,keycode-map,hotkeys}.test.js`,
`tools/timeline.mjs`, `src/manifest.base.json`, `build.mjs`,
`tools/check-syntax.mjs`, `test/fixture/probe.js`, `package.json`,
`README.md`, `docs/progress.md`

### What was built
- `cadence.js`: μ = `60000 / (wpm × 5)`, clipped Gaussian (σ = 0.25μ,
  bounds 0.5μ–2μ), mulberry32 + Box–Muller RNG, context pause multipliers
  (newline 4–8×, symbol 1.5–3×, word 1.2–2.2×), burst runs (0.6×, 3–8 chars),
  hard `MAX_DELAY_MS = 5000`.
- `mistakes.js`: adjacency derived from staggered physical key positions, not
  hand-written lists; `plan(char)` returns the wrong neighbour, 1–3 backspaces
  (80/13/7), and a 300–600 ms realisation pause.
- `keycode-map.js`: complete US-layout table — all 95 printable ASCII characters
  plus `\n`, `\r`, `\t`; letters, digits, shifted symbols, 11 punctuation pairs,
  and the 14 named keys. Anything a US keyboard cannot produce returns `null`
  instead of an invented descriptor.
- `hotkeys.js`: one canonical chord form (`Ctrl+Alt+Shift+Meta` order, so the
  shipping `Alt+Shift+…` defaults are already canonical), `parseChord`,
  `formatChord`, `normalize`, `matches`, `chordFromEvent`, `equals`, `label`,
  and `isRecordable` (requires Ctrl/Alt/Meta so a shortcut cannot hijack typing).
- `tools/timeline.mjs`: prints one row per keystroke (character, trigger
  character, delay, cumulative time, reason), summary statistics, and a delay
  histogram, using the shipped sampler and a seed.
- Unit tests `require()` the shipped classic scripts — no copy, no bundle, no
  drift.

### Acceptance check
- [x] `node tools/check-syntax.mjs` → `check ok — 26 files parsed, manifest order verified`
- [x] `npm test` → **44/44 pass**, 137 ms
  - cadence: seeded determinism; mean 300 ms within 3% over 20k samples;
    all samples clipped to 150–600 ms; 68% ±5% within one σ; newline/symbol/word
    ranges; burst runs; 5000 ms clamp; invalid WPM throws
  - mistakes: 26 letters with non-empty, non-self, symmetric neighbours; `a` is
    surrounded by `q,w,s,z`; rate 0 never, rate 1 always (letters only);
    observed rate within 1 pp of 0.03 over 10k; backspace distribution
  - keycode: 95/95 printable ASCII covered; 98 mapped chars incl. whitespace;
    legacy keyCodes for letters/digits/punctuation; `which === keyCode`;
    descriptors frozen; non-US characters return `null`
  - hotkeys: all six defaults round-trip unchanged; case/order normalisation;
    rejects modifier-only and malformed chords; exact modifier matching;
    modifier-only key presses never record; `Plus` keeps `+` round-trippable
- [x] `node build.mjs --no-zip` → chromium 19 files / firefox 19 files
- [x] `web-ext lint dist/firefox` → 0 errors, 0 warnings, 0 notices
- [x] `node tools/e2e.mjs` → **10/10 PASS** (overlay unaffected by the added
      engine scripts)
- [x] `node tools/timeline.mjs --wpm 40 --chars 12 --seed 42` → reproducible
      table, mean 239 ms over 12 chars (small sample; the 20k-sample test is the
      real mean check)

### Defects the tests caught (worth recording)
1. Named keys were built as raw objects, so `which` was `undefined` and the
   descriptor contract was only true for characters. Fixed by constructing every
   named key through the same `describe()` helper.
2. `byName(" ")` trimmed the space to `""` and returned `null`. Fixed by checking
   whitespace before trimming.
3. `chordFromEvent` treated `key: ""` as valid instead of falling back to
   `event.code`. Fixed with an explicit empty-string check.
4. `code` spellings (`KeyQ`, `Digit1`) were not accepted as a key fallback.
   Fixed in `canonicalKey`.
5. `printableChars()` included `\n`, `\r`, `\t`, so "95 printable ASCII" was
   false. Split into `mappedChars()` (98) and `printableChars()` (95).
6. The e2e probe sampled `data-boot` once, before the background round-trip
   resolved; adding four scripts widened the race and made an unrelated check
   flap. The probe now waits for the marker with an 8 s budget.

### Decisions made
- **Seeded RNG only in tests; unseeded in production.** Same code path, so a
  statistical claim about the model is a claim about the shipped sampler.
- **Clip before applying context multipliers.** Context beats are intentional and
  deterministic-ish; clipping the Gaussian first keeps the two concerns separate.
- **Mistake adjacency is derived from geometry.** A hand-typed neighbour table
  rots silently and produces physically impossible typos.
- **Only letters can be mistyped.** Slipping a digit or a brace into prose reads
  as a bug, not a human slip.
- **`keycode-map` returns `null` for unmappable characters** rather than a
  best-effort descriptor. M2 then knows it must use a text-insertion fallback.
- **Canonical modifier order is Ctrl, Alt, Shift, Meta** because the shipping
  defaults already use `Alt+Shift+…`; changing it would rewrite every stored
  hotkey on upgrade.
- **`isRecordable` requires Ctrl/Alt/Meta.** A capture-phase listener that binds
  plain `Space` or `Shift+A` would break ordinary typing everywhere. The parser
  stays permissive so a bad stored value can be reported; registration refuses it.
- **`tools/timeline.mjs` prints the trigger character.** The delay for a
  keystroke is sampled after the previous one; showing only `char` made the
  reason column look attached to the wrong character.

### What was learned
- A complete synthetic key press needs `key`, `code`, `keyCode`, `which`,
  `charCode`, `shiftKey` *and* `text` to be mutually consistent. Editors read
  different fields, and legacy codes are US-layout-specific.
- The model's mean only matches the target if the Gaussian is *not* rescaled
  after clipping. Clipping symmetrically at ±2σ leaves the mean intact; clipping
  asymmetrically would silently shift the effective speed.
- "Human-like" is mostly about variance and recovery, not about the mean: the
  same 40 WPM with σ = 0, no pauses and no mistakes is trivially detectable.

### Plan changes
- Added `content/engine/*` and `content/hotkeys.js` to the content-script order
  in three places: `src/manifest.base.json`, `build.mjs`, and
  `tools/check-syntax.mjs`. They are inert until M2, but registering them now
  means the order gate is exercised by the real build rather than added later.
- `package.json` `test` script changed to
  `node --test "test/unit/*.test.js"`; Node 24 does not accept a bare directory
  argument.

### Open issues / follow-ups
- Statistical tolerances are calibrated for 20k samples at σ = 0.25. If M6
  changes σ, re-check the "68% within one σ" bound rather than widening it.
- `keycode-map` is US-layout only. Non-US layouts will still type correctly
  through `key`/`text`, but `keyCode` will not match a local user's keyboard.
  Acceptable for v1; record it in the README limitations (M7).
- `cadence.js` duplicates the WPM → cps arithmetic that the popup and overlay
  compute inline (`wpm / 12`). Unify in M2 so there is one source of truth.
