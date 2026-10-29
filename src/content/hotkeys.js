/**
 * content/hotkeys.js — parse, format and match keyboard chords.
 *
 * A chord is stored as a *string* in settings ("Alt+Shift+Space") and compared
 * against a live KeyboardEvent. That conversion is a classic source of ghosts:
 *
 *   - `event.key` for Space is " ", not "Space"
 *   - `event.key` is "A" when Shift is held and "a" when it is not
 *   - modifier order is arbitrary in user input ("shift+alt+p")
 *   - "+" cannot be a separator and a key at the same time ("Ctrl++")
 *
 * So there is exactly one canonical form, and everything — settings, the
 * recorder UI, the capture-phase listener — goes through it. A chord is
 * `{ctrl, alt, shift, meta, key}` with canonical modifier order
 * Ctrl+Alt+Shift+Meta, which keeps the shipping defaults ("Alt+Shift+Space")
 * already canonical.
 *
 * Pure: no DOM listeners here. The capture-phase listener lives in content.js
 * (M5); this module only answers "does this event match this chord?".
 */

(function (global) {
  "use strict";

  const AT = (global.AutoTyper = global.AutoTyper || {});

  const MODIFIER_ORDER = Object.freeze(["Ctrl", "Alt", "Shift", "Meta"]);
  const MODIFIER_FLAG = Object.freeze({ Ctrl: "ctrl", Alt: "alt", Shift: "shift", Meta: "meta" });

  const MODIFIER_ALIASES = Object.freeze({
    ctrl: "Ctrl",
    control: "Ctrl",
    alt: "Alt",
    option: "Alt",
    opt: "Alt",
    shift: "Shift",
    meta: "Meta",
    cmd: "Meta",
    command: "Meta",
    super: "Meta",
    win: "Meta",
    windows: "Meta",
  });

  /**
   * Named keys a user can record. Single letters/digits/punctuation are handled
   * by the one-character branch of `canonicalKey`.
   */
  const KEY_ALIASES = Object.freeze({
    space: "Space",
    spacebar: "Space",
    enter: "Enter",
    return: "Enter",
    tab: "Tab",
    backspace: "Backspace",
    back: "Backspace",
    esc: "Escape",
    escape: "Escape",
    del: "Delete",
    delete: "Delete",
    ins: "Insert",
    insert: "Insert",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pgup: "PageUp",
    pagedown: "PageDown",
    pgdn: "PageDown",
    left: "ArrowLeft",
    arrowleft: "ArrowLeft",
    up: "ArrowUp",
    arrowup: "ArrowUp",
    right: "ArrowRight",
    arrowright: "ArrowRight",
    down: "ArrowDown",
    arrowdown: "ArrowDown",
    plus: "Plus",
    minus: "-",
  });

  /** Keys that are only ever modifiers; they can never be a chord's main key. */
  const MODIFIER_KEY_NAMES = Object.freeze(
    new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "OS", "CapsLock", "Fn", "FnLock", "Hyper", "Super", "Symbol"]),
  );

  const FUNCTION_KEY = /^f([1-9]|1[0-2])$/;
  const LETTER = /^[a-z]$/i;

  /**
   * Collapse one token to its canonical key name, or `null` if it is not a key
   * we are willing to register as a shortcut.
   */
  function canonicalKey(raw) {
    if (typeof raw !== "string") return null;

    // Space arrives from `event.key` as a single space, which trim() would eat.
    if (/^\s+$/.test(raw)) return raw.length === 1 && raw === " " ? "Space" : null;

    const value = raw.trim();
    if (!value) return null;

    if (value.length === 1) {
      if (LETTER.test(value)) return value.toUpperCase();
      // "+" is the chord separator, so it needs a name to stay round-trippable.
      if (value === "+") return "Plus";
      return value;
    }

    const normalized = value.toLowerCase().replace(/[\s_-]+/g, "");
    if (FUNCTION_KEY.test(normalized)) return normalized.toUpperCase();

    // Physical `code` spellings, used when `event.key` is missing. Only letters
    // and digits: punctuation codes ("Semicolon") have no unambiguous label.
    const codeLetter = /^key([a-z])$/.exec(normalized);
    if (codeLetter) return codeLetter[1].toUpperCase();
    const codeDigit = /^digit([0-9])$/.exec(normalized);
    if (codeDigit) return codeDigit[1];

    const named = KEY_ALIASES[normalized];
    if (named) return named;
    if (MODIFIER_KEY_NAMES.has(value)) return null;
    return null;
  }

  /** Canonical key name for a live event, preferring `key` over `code`. */
  function keyFromEvent(event) {
    if (!event) return null;
    // `key` can be "" as well as "Unidentified" on synthetic/IME events; an
    // empty string is not a key, so fall through to the physical `code`.
    if (typeof event.key === "string" && event.key && event.key !== "Unidentified") return event.key;
    if (typeof event.code === "string" && event.code) return event.code;
    return null;
  }

  /**
   * @param {string} text e.g. "Alt+Shift+Space"
   * @returns {null | {ctrl:boolean, alt:boolean, shift:boolean, meta:boolean, key:string}}
   *   `null` for anything malformed — including a chord with no main key.
   */
  function parseChord(text) {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    const tokens = trimmed.split("+");
    // An empty token means a trailing/double "+", which we deliberately do not
    // interpret: canonical output spells that key as "Plus".
    if (tokens.some((token) => token.trim() === "")) return null;

    const keyToken = tokens.pop();
    const chord = { ctrl: false, alt: false, shift: false, meta: false };

    for (const token of tokens) {
      const name = MODIFIER_ALIASES[token.trim().toLowerCase()];
      if (!name) return null;
      const flag = MODIFIER_FLAG[name];
      if (chord[flag]) return null; // duplicated modifier: "Ctrl+Ctrl+K"
      chord[flag] = true;
    }

    const key = canonicalKey(keyToken);
    if (!key) return null;

    return Object.freeze({ ...chord, key });
  }

  /** Canonical string form. Returns "" for an invalid/missing chord. */
  function formatChord(chord) {
    if (!chord || typeof chord !== "object" || !chord.key) return "";
    const parts = [];
    for (const name of MODIFIER_ORDER) {
      if (chord[MODIFIER_FLAG[name]]) parts.push(name);
    }
    parts.push(chord.key);
    return parts.join("+");
  }

  /** Parse + format, or "" if unparseable. Useful for storage normalisation. */
  function normalize(text) {
    const chord = typeof text === "string" ? parseChord(text) : text;
    return formatChord(chord);
  }

  /** Does a live event match a chord? Modifiers must match exactly. */
  function matches(chord, event) {
    if (!chord || !event || !chord.key) return false;
    if (Boolean(chord.ctrl) !== Boolean(event.ctrlKey)) return false;
    if (Boolean(chord.alt) !== Boolean(event.altKey)) return false;
    if (Boolean(chord.shift) !== Boolean(event.shiftKey)) return false;
    if (Boolean(chord.meta) !== Boolean(event.metaKey)) return false;

    const key = canonicalKey(keyFromEvent(event));
    return key !== null && key === chord.key;
  }

  /** Build a canonical chord from a live event, or `null` for unusable input. */
  function chordFromEvent(event) {
    if (!event) return null;
    // A modifier pressed alone is not a shortcut; recording must wait for a
    // non-modifier key, otherwise "hold Alt" would bind "Alt".
    if (typeof event.key === "string" && MODIFIER_KEY_NAMES.has(event.key)) return null;

    const key = canonicalKey(keyFromEvent(event));
    if (!key) return null;

    return Object.freeze({
      ctrl: Boolean(event.ctrlKey),
      alt: Boolean(event.altKey),
      shift: Boolean(event.shiftKey),
      meta: Boolean(event.metaKey),
      key,
    });
  }

  /**
   * Safety rule for the recorder.
   *
   * A shortcut with no Ctrl/Alt/Meta would hijack normal typing: binding "Space"
   * to start/stop means every space in every editor is intercepted (the listener
   * runs in the capture phase and calls preventDefault). Shift alone does not
   * count, because Shift+Space is still a space.
   *
   * The parser stays permissive so a bad stored value can be *reported* rather
   * than silently discarded; registration must use this check.
   */
  function isRecordable(chord) {
    const parsed = typeof chord === "string" ? parseChord(chord) : chord;
    if (!parsed) return false;
    return Boolean(parsed.ctrl || parsed.alt || parsed.meta);
  }

  /** Compare two chords given as strings or objects. */
  function equals(a, b) {
    const left = typeof a === "string" ? parseChord(a) : a;
    const right = typeof b === "string" ? parseChord(b) : b;
    if (!left || !right) return false;
    return formatChord(left) === formatChord(right);
  }

  /** Human label for a chord, e.g. for a tooltip: "Alt + Shift + Space". */
  function label(chord) {
    const text = typeof chord === "string" ? normalize(chord) : formatChord(chord);
    return text ? text.split("+").join(" + ") : "";
  }

  AT.hotkeys = Object.freeze({
    MODIFIER_ORDER,
    MODIFIER_KEY_NAMES,
    canonicalKey,
    parseChord,
    formatChord,
    normalize,
    matches,
    chordFromEvent,
    isRecordable,
    equals,
    label,
  });
})(globalThis);
