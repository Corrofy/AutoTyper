/**
 * content/engine/keycode-map.js — character → the fields a real key press carries.
 *
 * WHY THIS EXISTS
 * Editors disagree about which field of a KeyboardEvent they read:
 *
 *   - Monaco/CodeMirror 6 mostly read `event.key` and `event.code`
 *   - CodeMirror 5 and Ace still consult the legacy `keyCode`/`which`
 *   - some React inputs read `event.charCode` on keypress
 *
 * A synthetic event that only sets `key` looks real in the console and does
 * nothing in half the editors in the world. So a single character has to produce
 * a *complete*, mutually consistent descriptor:
 *
 *   { key, code, keyCode, which, charCode, shiftKey, text }
 *
 * `key` is the character the key produces ('A', '!', 'Enter'), `code` is the
 * physical key ('KeyA', 'Digit1', 'Enter'), and `keyCode` is the US-layout
 * legacy number (65, 49, 13). For a shifted character the base keyCode is kept
 * and `shiftKey` becomes true — that is what a real Shift+1 reports.
 *
 * LAYOUT LIMITATION, STATED PLAINLY
 * `code` and `keyCode` describe a **US QWERTY** keyboard. A user on AZERTY or
 * Dvorak pressing "the key that makes ;" would report a different `code`. Editors
 * overwhelmingly match on `key`/`text`, so this is acceptable for v1, but it is
 * the reason the map is data (below) rather than clever arithmetic.
 *
 * Pure: no DOM, no extension APIs, no timers. Node tests require() this file.
 */

(function (global) {
  "use strict";

  const AT = (global.AutoTyper = global.AutoTyper || {});

  /**
   * US-layout punctuation, as [unshifted, shifted, code, keyCode].
   * Numbers are the legacy VirtualKey codes; they are data, not maths.
   */
  const PUNCTUATION = Object.freeze([
    Object.freeze([";", ":", "Semicolon", 186]),
    Object.freeze(["=", "+", "Equal", 187]),
    Object.freeze([",", "<", "Comma", 188]),
    Object.freeze(["-", "_", "Minus", 189]),
    Object.freeze([".", ">", "Period", 190]),
    Object.freeze(["/", "?", "Slash", 191]),
    Object.freeze(["`", "~", "Backquote", 192]),
    Object.freeze(["[", "{", "BracketLeft", 219]),
    Object.freeze(["\\", "|", "Backslash", 220]),
    Object.freeze(["]", "}", "BracketRight", 221]),
    Object.freeze(["'", '"', "Quote", 222]),
  ]);

  /** Shifted digit symbols, in keyboard order. Index 0 is Shift+1 = "!". */
  const SHIFTED_DIGITS = Object.freeze(["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"]);

  /**
   * Keys that insert nothing (or insert something that is not their own
   * character), plus the navigation keys the engine may need later.
   * `charCode` is the legacy keypress code, which is 0 for keys that never
   * produce a keypress.
   *
   * Raw data first, descriptors second: going through `describe()` is what
   * guarantees `which` and `shiftKey` exist on *every* entry. Building the
   * named keys by hand is exactly how `which` went missing the first time.
   */
  const NAMED_KEY_DATA = Object.freeze({
    Enter: Object.freeze({ key: "Enter", code: "Enter", keyCode: 13, charCode: 13, text: "\n" }),
    Tab: Object.freeze({ key: "Tab", code: "Tab", keyCode: 9, charCode: 9, text: "\t" }),
    Backspace: Object.freeze({ key: "Backspace", code: "Backspace", keyCode: 8, charCode: 8, text: "" }),
    Escape: Object.freeze({ key: "Escape", code: "Escape", keyCode: 27, charCode: 27, text: "" }),
    ArrowLeft: Object.freeze({ key: "ArrowLeft", code: "ArrowLeft", keyCode: 37, charCode: 0, text: "" }),
    ArrowUp: Object.freeze({ key: "ArrowUp", code: "ArrowUp", keyCode: 38, charCode: 0, text: "" }),
    ArrowRight: Object.freeze({ key: "ArrowRight", code: "ArrowRight", keyCode: 39, charCode: 0, text: "" }),
    ArrowDown: Object.freeze({ key: "ArrowDown", code: "ArrowDown", keyCode: 40, charCode: 0, text: "" }),
    Home: Object.freeze({ key: "Home", code: "Home", keyCode: 36, charCode: 0, text: "" }),
    End: Object.freeze({ key: "End", code: "End", keyCode: 35, charCode: 0, text: "" }),
    PageUp: Object.freeze({ key: "PageUp", code: "PageUp", keyCode: 33, charCode: 0, text: "" }),
    PageDown: Object.freeze({ key: "PageDown", code: "PageDown", keyCode: 34, charCode: 0, text: "" }),
    Insert: Object.freeze({ key: "Insert", code: "Insert", keyCode: 45, charCode: 0, text: "" }),
    Delete: Object.freeze({ key: "Delete", code: "Delete", keyCode: 46, charCode: 0, text: "" }),
  });

  const NAMED_KEYS = Object.freeze(
    Object.fromEntries(Object.entries(NAMED_KEY_DATA).map(([name, data]) => [name, describe(data)])),
  );

  /** Keys that carry no character and must never be treated as typable text. */
  const MODIFIER_KEYS = Object.freeze(
    new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "OS", "CapsLock", "Fn", "FnLock", "Hyper", "Super"]),
  );

  /** Common spellings accepted by `byName`. Keys are lower-cased, no spaces. */
  const NAME_ALIASES = Object.freeze({
    enter: "Enter",
    return: "Enter",
    newline: "Enter",
    tab: "Tab",
    backspace: "Backspace",
    back: "Backspace",
    esc: "Escape",
    escape: "Escape",
    left: "ArrowLeft",
    arrowleft: "ArrowLeft",
    up: "ArrowUp",
    arrowup: "ArrowUp",
    right: "ArrowRight",
    arrowright: "ArrowRight",
    down: "ArrowDown",
    arrowdown: "ArrowDown",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pgup: "PageUp",
    pagedown: "PageDown",
    pgdn: "PageDown",
    insert: "Insert",
    ins: "Insert",
    delete: "Delete",
    del: "Delete",
  });

  // A descriptor is frozen so callers cannot accidentally mutate the shared
  // table (a bug that would be invisible until the second keystroke).
  function describe({ key, code, keyCode, charCode, shifted = false, text }) {
    return Object.freeze({
      key,
      code,
      keyCode,
      which: keyCode,
      charCode,
      shiftKey: shifted,
      text,
    });
  }

  const BY_CHAR = new Map();
  const BY_NAME = new Map();

  // ---- letters -------------------------------------------------------------

  for (let code = 97; code <= 122; code += 1) {
    const lower = String.fromCharCode(code);
    const upper = lower.toUpperCase();
    const base = `Key${upper}`;
    // keyCode is the ASCII uppercase range (65–90), independent of shift.
    BY_CHAR.set(lower, describe({ key: lower, code: base, keyCode: code - 32, charCode: code, text: lower }));
    BY_CHAR.set(
      upper,
      describe({ key: upper, code: base, keyCode: code - 32, charCode: code - 32, shifted: true, text: upper }),
    );
  }

  // ---- digits --------------------------------------------------------------

  for (let digit = 0; digit <= 9; digit += 1) {
    const char = String(digit);
    const keyCode = 48 + digit; // "0" is 48 … "9" is 57
    BY_CHAR.set(char, describe({ key: char, code: `Digit${digit}`, keyCode, charCode: keyCode, text: char }));

    const shifted = SHIFTED_DIGITS[digit === 0 ? 9 : digit - 1];
    BY_CHAR.set(
      shifted,
      describe({
        key: shifted,
        code: `Digit${digit}`,
        keyCode,
        charCode: shifted.codePointAt(0),
        shifted: true,
        text: shifted,
      }),
    );
  }

  // ---- punctuation ---------------------------------------------------------

  for (const [base, shifted, code, keyCode] of PUNCTUATION) {
    BY_CHAR.set(base, describe({ key: base, code, keyCode, charCode: base.codePointAt(0), text: base }));
    BY_CHAR.set(
      shifted,
      describe({
        key: shifted,
        code,
        keyCode,
        charCode: shifted.codePointAt(0),
        shifted: true,
        text: shifted,
      }),
    );
  }

  // ---- whitespace and named keys -------------------------------------------

  const SPACE = describe({ key: " ", code: "Space", keyCode: 32, charCode: 32, text: " " });
  BY_CHAR.set(" ", SPACE);
  BY_CHAR.set("\n", NAMED_KEYS.Enter);
  BY_CHAR.set("\r", NAMED_KEYS.Enter); // normalised CRLF line endings
  BY_CHAR.set("\t", NAMED_KEYS.Tab);

  BY_NAME.set("space", SPACE);
  BY_NAME.set(" ", SPACE);
  for (const [name, descriptor] of Object.entries(NAMED_KEYS)) {
    BY_NAME.set(name.toLowerCase(), descriptor);
  }
  for (const [alias, name] of Object.entries(NAME_ALIASES)) {
    const descriptor = NAMED_KEYS[name];
    if (descriptor) BY_NAME.set(alias, descriptor);
  }

  // ---- public API ----------------------------------------------------------

  /**
   * Describe one character as a key press, or `null` if a US keyboard cannot
   * produce it (emoji, accented letters, em dashes, control characters).
   *
   * Returning `null` rather than inventing a fake keyCode is deliberate: the
   * caller then knows it must fall back to input/paste insertion, instead of
   * dispatching a plausible-looking event that the editor ignores.
   *
   * @param {string} char
   * @returns {null | {key:string, code:string, keyCode:number, which:number, charCode:number, shiftKey:boolean, text:string}}
   */
  function lookup(char) {
    if (typeof char !== "string" || char.length !== 1) return null;
    return BY_CHAR.get(char) || null;
  }

  /** Same as `lookup`, but by key name: "arrowup", "space", "pgdn", … */
  function byName(name) {
    if (typeof name !== "string") return null;
    // Check the raw value first: trimming a lone space would erase the one name
    // that is itself whitespace.
    if (name === " ") return SPACE;
    return BY_NAME.get(name.trim().toLowerCase()) || null;
  }

  /** True when the character can be produced by a physical US key press. */
  function isTypable(char) {
    return lookup(char) !== null;
  }

  /** Every character this map can produce, including "\n" and "\t". */
  function mappedChars() {
    return [...BY_CHAR.keys()];
  }

  /** Only the printable ASCII ones (0x20–0x7E), for the completeness contract. */
  function printableChars() {
    return mappedChars().filter((char) => char.length === 1 && char >= " " && char <= "~");
  }

  AT.keycodeMap = Object.freeze({
    PUNCTUATION,
    SHIFTED_DIGITS,
    NAMED_KEYS,
    MODIFIER_KEYS,
    lookup,
    byName,
    isTypable,
    mappedChars,
    printableChars,
  });
})(globalThis);
