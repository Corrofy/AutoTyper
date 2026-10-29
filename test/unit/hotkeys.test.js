/**
 * test/unit/hotkeys.test.js — chord parsing, formatting and matching.
 *
 * The regression this file exists to prevent: a shortcut that silently stops
 * firing because settings stored "shift+alt+space" while the listener compared
 * against "Alt+Shift+Space". Canonicalisation happens in one place, and these
 * tests pin it down.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require(path.join(__dirname, "..", "..", "src", "content", "hotkeys.js"));
const hotkeys = globalThis.AutoTyper.hotkeys;

/** Minimal KeyboardEvent stand-in; only the fields the matcher reads. */
function event(key, modifiers = {}) {
  return {
    key,
    code: modifiers.code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  };
}

test("every shipping default is already canonical", () => {
  const defaults = [
    "Alt+Shift+Space",
    "Alt+Shift+P",
    "Alt+Shift+E",
    "Alt+Shift+ArrowUp",
    "Alt+Shift+ArrowDown",
    "Alt+Shift+M",
  ];

  for (const chord of defaults) {
    assert.equal(hotkeys.normalize(chord), chord);
    assert.ok(hotkeys.parseChord(chord), chord);
  }
});

test("modifier order and case are normalised", () => {
  assert.equal(hotkeys.normalize("shift+alt+space"), "Alt+Shift+Space");
  assert.equal(hotkeys.normalize("ALT + SHIFT + p"), "Alt+Shift+P");
  assert.equal(hotkeys.normalize("option+shift+arrowup"), "Alt+Shift+ArrowUp");
  assert.equal(hotkeys.normalize("cmd+k"), "Meta+K");
  assert.equal(hotkeys.normalize("control+alt+delete"), "Ctrl+Alt+Delete");
});

test("parseChord produces flags and a canonical key", () => {
  assert.deepEqual(hotkeys.parseChord("Ctrl+Alt+Shift+Meta+K"), {
    ctrl: true,
    alt: true,
    shift: true,
    meta: true,
    key: "K",
  });

  const chord = hotkeys.parseChord("Alt+Shift+Space");
  assert.equal(chord.alt, true);
  assert.equal(chord.shift, true);
  assert.equal(chord.ctrl, false);
  assert.equal(chord.meta, false);
  assert.equal(chord.key, "Space");
});

test("chords without a main key are rejected", () => {
  for (const input of ["", "   ", "Alt", "Alt+Shift", "Ctrl+Alt+Meta", "Shift", null, undefined, 42, {}]) {
    assert.equal(hotkeys.parseChord(input), null, `expected null for ${JSON.stringify(input)}`);
  }
});

test("malformed chords are rejected instead of half-parsed", () => {
  for (const input of [
    "Alt+Foo",
    "Alt++",
    "Ctrl+Ctrl+K",
    "Hyper+Shift+K", // Hyper is a modifier the parser does not bind
    "Alt+Shift+Unidentified",
    "Alt+Shift+",
  ]) {
    assert.equal(hotkeys.parseChord(input), null, `expected null for ${JSON.stringify(input)}`);
  }
});

test('"+" is spelled "Plus" so a chord stays round-trippable', () => {
  const chord = hotkeys.parseChord("Ctrl+Shift+Plus");
  assert.equal(chord.key, "Plus");
  assert.equal(hotkeys.formatChord(chord), "Ctrl+Shift+Plus");
  assert.equal(hotkeys.normalize("Ctrl+Shift++"), "");
});

test("matches requires an exact modifier set", () => {
  const chord = hotkeys.parseChord("Alt+Shift+Space");

  assert.equal(hotkeys.matches(chord, event(" ", { altKey: true, shiftKey: true })), true);

  // Extra modifier: the page's own Ctrl+Alt+Shift+Space must not trigger us.
  assert.equal(hotkeys.matches(chord, event(" ", { altKey: true, shiftKey: true, ctrlKey: true })), false);
  // Missing modifier.
  assert.equal(hotkeys.matches(chord, event(" ", { altKey: true })), false);
  // Wrong key.
  assert.equal(hotkeys.matches(chord, event("Enter", { altKey: true, shiftKey: true })), false);
  // Missing event.
  assert.equal(hotkeys.matches(chord, null), false);
});

test("letter matching ignores the case of event.key", () => {
  const chord = hotkeys.parseChord("Alt+P");
  assert.equal(hotkeys.matches(chord, event("p", { altKey: true })), true);
  assert.equal(hotkeys.matches(chord, event("p", { altKey: true, shiftKey: true })), false);

  // Shift+A reports key "A"; a chord recorded with Shift holds its own flag.
  const shifted = hotkeys.parseChord("Alt+Shift+A");
  assert.equal(hotkeys.matches(shifted, event("A", { altKey: true, shiftKey: true })), true);
});

test("chordFromEvent records what a user actually pressed", () => {
  const space = hotkeys.chordFromEvent(event(" ", { altKey: true, shiftKey: true }));
  assert.equal(hotkeys.formatChord(space), "Alt+Shift+Space");
  assert.equal(hotkeys.isRecordable(space), true);

  const letter = hotkeys.chordFromEvent(event("k", { ctrlKey: true }));
  assert.equal(hotkeys.formatChord(letter), "Ctrl+K");

  const shiftedLetter = hotkeys.chordFromEvent(event("A", { shiftKey: true }));
  assert.equal(hotkeys.formatChord(shiftedLetter), "Shift+A");
});

test("modifier-only presses never become a chord", () => {
  for (const key of ["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "OS"]) {
    assert.equal(hotkeys.chordFromEvent(event(key, { shiftKey: true })), null, key);
  }
  assert.equal(hotkeys.chordFromEvent(null), null);
});

test("chordFromEvent can fall back to event.code", () => {
  // IME and some synthetic events leave `key` as "Unidentified".
  const chord = hotkeys.chordFromEvent(event("Unidentified", { code: "Space", altKey: true }));
  assert.equal(hotkeys.formatChord(chord), "Alt+Space");

  const letter = hotkeys.chordFromEvent(event("", { code: "KeyQ", ctrlKey: true }));
  assert.equal(hotkeys.formatChord(letter), "Ctrl+Q");
});

test("recordable chords need Ctrl, Alt or Meta", () => {
  assert.equal(hotkeys.isRecordable("Alt+Shift+Space"), true);
  assert.equal(hotkeys.isRecordable("Ctrl+K"), true);
  assert.equal(hotkeys.isRecordable("Meta+K"), true);

  // These would hijack ordinary typing, so the recorder must refuse them.
  assert.equal(hotkeys.isRecordable("Space"), false);
  assert.equal(hotkeys.isRecordable("P"), false);
  assert.equal(hotkeys.isRecordable("Shift+Space"), false);
  assert.equal(hotkeys.isRecordable("Shift+A"), false);
  assert.equal(hotkeys.isRecordable(""), false);
});

test("equals and label behave predictably", () => {
  assert.equal(hotkeys.equals("Alt+Shift+Space", "shift+alt+space"), true);
  assert.equal(hotkeys.equals("Alt+P", "Alt+Shift+P"), false);
  assert.equal(hotkeys.equals("nonsense", "Alt+P"), false);

  assert.equal(hotkeys.label("Alt+Shift+Space"), "Alt + Shift + Space");
  assert.equal(hotkeys.label(""), "");
  assert.equal(hotkeys.formatChord(null), "");
});
