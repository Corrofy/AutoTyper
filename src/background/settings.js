/**
 * background/settings.js — the configuration schema, its defaults, validation,
 * and the only writer of the settings record.
 *
 * Loaded in three places (see manifest + build.mjs):
 *   - background  → owns writes
 *   - content     → reads directly from storage (fast, no round-trip)
 *   - popup       → reads, and sends mutations to the background
 *
 * Writes go through the background so validation/bounds live in exactly one
 * place. Reads are direct because `storage.local` is available in content
 * scripts and a storage read is cheaper than a message round-trip.
 *
 * Depends on: shared/protocol.js
 */

(function (global) {
  "use strict";

  const AT = global.AutoTyper;
  if (!AT || !AT.protocol) {
    throw new Error("Auto Typer: settings.js loaded before protocol.js");
  }

  const { api, STORAGE_KEYS } = AT.protocol;
  const KEY = STORAGE_KEYS.SETTINGS;
  const SCHEMA_VERSION = 1;

  /**
   * Hard bounds. These are not UI hints: `sanitize()` enforces them, so a
   * hand-edited storage record or a buggy message cannot push the engine into an
   * impossible state.
   *
   * Speed is clamped to 30–50 WPM on purpose. WPM is the human range we model;
   * showing ms/char and cps is a convenience, not a second source of truth.
   *   30 WPM →  2.50 cps → 400 ms/char
   *   40 WPM →  3.33 cps → 300 ms/char
   *   50 WPM →  4.17 cps → 240 ms/char
   */
  const LIMITS = Object.freeze({
    wpm: [30, 50],
    sigma: [0, 0.6],
    jitterFactor: [0.25, 1],
    mistakeRate: [0, 0.2],
    mistakePauseMs: [0, 1500],
    burstChance: [0, 0.5],
    countdownMs: [0, 5000],
    snippetChars: 200000,
    hotkeyLength: 64,
  });

  function defaults() {
    return {
      version: SCHEMA_VERSION,
      enabled: false,
      snippet: { text: "", filename: null },
      mode: "insert", // "insert" | "replace"
      speed: { wpm: 40 },
      jitter: { enabled: true, sigma: 0.25, minFactor: 0.5, maxFactor: 2 },
      pauses: { word: true, symbol: true, newline: true, burstChance: 0.08 },
      mistakes: { enabled: true, rate: 0.03, minPauseMs: 300, maxPauseMs: 600 },
      hotkeys: {
        startStop: "Alt+Shift+Space",
        pauseResume: "Alt+Shift+P",
        toggleEnabled: "Alt+Shift+E",
        speedUp: "Alt+Shift+ArrowUp",
        speedDown: "Alt+Shift+ArrowDown",
        toggleMistakes: "Alt+Shift+M",
      },
      overlay: { visible: true, x: 24, y: 24, collapsed: false },
      behavior: { pauseOnBlur: true, countdownMs: 0, diagnostics: false },
    };
  }

  // ---- primitive coercion -------------------------------------------------

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function bool(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  function num(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, [lo, hi], fallback) {
    const n = num(value, fallback);
    return Math.min(hi, Math.max(lo, n));
  }

  function text(value, fallback = "") {
    if (typeof value !== "string") return fallback;
    return value.length > LIMITS.snippetChars ? value.slice(0, LIMITS.snippetChars) : value;
  }

  function chord(value, fallback) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > LIMITS.hotkeyLength) return fallback;
    // Rendered form is modifier tokens joined with "+": "Alt+Shift+Space".
    return trimmed;
  }

  // ---- validation ---------------------------------------------------------

  /**
   * Merge arbitrary input onto the defaults, keeping only known keys and
   * enforcing types/bounds. Unknown keys are dropped so a stale or hand-edited
   * record cannot leak junk into the engine.
   */
  function sanitize(raw) {
    const d = defaults();
    if (!isPlainObject(raw)) return d;

    const out = d;

    out.enabled = bool(raw.enabled, d.enabled);
    out.mode = raw.mode === "replace" ? "replace" : "insert";

    if (isPlainObject(raw.snippet)) {
      out.snippet.text = text(raw.snippet.text, "");
      out.snippet.filename = typeof raw.snippet.filename === "string" ? raw.snippet.filename.slice(0, 255) : null;
    }

    if (isPlainObject(raw.speed)) {
      out.speed.wpm = Math.round(clamp(raw.speed.wpm, LIMITS.wpm, d.speed.wpm));
    }

    if (isPlainObject(raw.jitter)) {
      out.jitter.enabled = bool(raw.jitter.enabled, d.jitter.enabled);
      out.jitter.sigma = clamp(raw.jitter.sigma, LIMITS.sigma, d.jitter.sigma);
      out.jitter.minFactor = clamp(raw.jitter.minFactor, LIMITS.jitterFactor, d.jitter.minFactor);
      out.jitter.maxFactor = clamp(raw.jitter.maxFactor, LIMITS.jitterFactor, d.jitter.maxFactor);
      // An inverted range would make the sampler throw; normalise it instead.
      if (out.jitter.minFactor > out.jitter.maxFactor) {
        const { minFactor, maxFactor } = out.jitter;
        out.jitter.minFactor = maxFactor;
        out.jitter.maxFactor = minFactor;
      }
    }

    if (isPlainObject(raw.pauses)) {
      out.pauses.word = bool(raw.pauses.word, d.pauses.word);
      out.pauses.symbol = bool(raw.pauses.symbol, d.pauses.symbol);
      out.pauses.newline = bool(raw.pauses.newline, d.pauses.newline);
      out.pauses.burstChance = clamp(raw.pauses.burstChance, LIMITS.burstChance, d.pauses.burstChance);
    }

    if (isPlainObject(raw.mistakes)) {
      out.mistakes.enabled = bool(raw.mistakes.enabled, d.mistakes.enabled);
      out.mistakes.rate = clamp(raw.mistakes.rate, LIMITS.mistakeRate, d.mistakes.rate);
      out.mistakes.minPauseMs = Math.round(clamp(raw.mistakes.minPauseMs, LIMITS.mistakePauseMs, d.mistakes.minPauseMs));
      out.mistakes.maxPauseMs = Math.round(clamp(raw.mistakes.maxPauseMs, LIMITS.mistakePauseMs, d.mistakes.maxPauseMs));
      if (out.mistakes.minPauseMs > out.mistakes.maxPauseMs) {
        const { minPauseMs, maxPauseMs } = out.mistakes;
        out.mistakes.minPauseMs = maxPauseMs;
        out.mistakes.maxPauseMs = minPauseMs;
      }
    }

    if (isPlainObject(raw.hotkeys)) {
      for (const name of Object.keys(d.hotkeys)) {
        out.hotkeys[name] = chord(raw.hotkeys[name], d.hotkeys[name]);
      }
    }

    if (isPlainObject(raw.overlay)) {
      out.overlay.visible = bool(raw.overlay.visible, d.overlay.visible);
      out.overlay.collapsed = bool(raw.overlay.collapsed, d.overlay.collapsed);
      out.overlay.x = Math.round(num(raw.overlay.x, d.overlay.x));
      out.overlay.y = Math.round(num(raw.overlay.y, d.overlay.y));
    }

    if (isPlainObject(raw.behavior)) {
      out.behavior.pauseOnBlur = bool(raw.behavior.pauseOnBlur, d.behavior.pauseOnBlur);
      out.behavior.countdownMs = Math.round(clamp(raw.behavior.countdownMs, LIMITS.countdownMs, d.behavior.countdownMs));
      out.behavior.diagnostics = bool(raw.behavior.diagnostics, d.behavior.diagnostics);
    }

    // Migration hook. When a field changes shape, bump SCHEMA_VERSION and add a
    // `case 1:` block here that upgrades the old record before sanitising.
    out.version = SCHEMA_VERSION;
    return out;
  }

  // ---- persistence --------------------------------------------------------

  async function get() {
    const record = await api.storage.local.get(KEY);
    return sanitize(record && record[KEY]);
  }

  async function save(next) {
    const clean = sanitize(next);
    await api.storage.local.set({ [KEY]: clean });
    return clean;
  }

  function deepMerge(base, patch) {
    if (!isPlainObject(patch)) return base;
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (isPlainObject(value) && isPlainObject(base[key])) out[key] = deepMerge(base[key], value);
      else if (value !== undefined) out[key] = value;
    }
    return out;
  }

  /** Partial update: read → merge → validate → write. */
  async function patch(partial) {
    const current = await get();
    return save(deepMerge(current, partial));
  }

  async function reset() {
    const next = defaults();
    await api.storage.local.set({ [KEY]: next });
    return next;
  }

  /**
   * Subscribe to settings changes from any context. `storage.onChanged` fires in
   * every frame and every extension page, which is why it is used instead of the
   * background broadcasting messages: it cannot be missed if a context was not
   * listening yet, and it costs no message traffic.
   */
  function onChange(callback) {
    const listener = (changes, areaName) => {
      if (areaName !== "local" || !changes[KEY]) return;
      callback(sanitize(changes[KEY].newValue), sanitize(changes[KEY].oldValue));
    };
    api.storage.onChanged.addListener(listener);
    return () => api.storage.onChanged.removeListener(listener);
  }

  AT.settings = Object.freeze({
    SCHEMA_VERSION,
    LIMITS,
    defaults,
    sanitize,
    get,
    save,
    patch,
    reset,
    onChange,
  });
})(globalThis);
