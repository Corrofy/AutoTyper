/**
 * test/unit/keycode-map.test.js — the completeness contract.
 *
 * The key claim this file defends: every printable ASCII character produces a
 * *consistent* event descriptor, and everything outside a US keyboard returns
 * null instead of a plausible lie.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require(path.join(__dirname, "..", "..", "src", "content", "engine", "keycode-map.js"));
const map = globalThis.AutoTyper.keycodeMap;

test("all 95 printable ASCII characters are mapped", () => {
  for (let code = 32; code <= 126; code += 1) {
    const char = String.fromCharCode(code);
    assert.ok(map.lookup(char), `missing mapping for ${JSON.stringify(char)} (0x${code.toString(16)})`);
  }
  assert.equal(map.printableChars().length, 95);
  assert.equal(new Set(map.printableChars()).size, 95);

  // The full map also carries the three whitespace characters that are not
  // printable ASCII but are extremely common in code.
  assert.equal(map.mappedChars().length, 98);
  for (const char of ["\n", "\r", "\t"]) {
    assert.ok(map.lookup(char), `missing whitespace mapping ${JSON.stringify(char)}`);
  }
});

test("letters keep the uppercase legacy keyCode under Shift", () => {
  assert.deepEqual(map.lookup("a"), {
    key: "a",
    code: "KeyA",
    keyCode: 65,
    which: 65,
    charCode: 97,
    shiftKey: false,
    text: "a",
  });

  assert.deepEqual(map.lookup("A"), {
    key: "A",
    code: "KeyA",
    keyCode: 65,
    which: 65,
    charCode: 65,
    shiftKey: true,
    text: "A",
  });
});

test("digits and shifted digit symbols share a physical key", () => {
  assert.equal(map.lookup("1").keyCode, 49);
  assert.equal(map.lookup("1").code, "Digit1");
  assert.equal(map.lookup("1").shiftKey, false);

  assert.equal(map.lookup("!").keyCode, 49);
  assert.equal(map.lookup("!").code, "Digit1");
  assert.equal(map.lookup("!").key, "!");
  assert.equal(map.lookup("!").charCode, 33);
  assert.equal(map.lookup("!").shiftKey, true);

  assert.equal(map.lookup("0").keyCode, 48);
  assert.equal(map.lookup(")").keyCode, 48);
  assert.equal(map.lookup(")").code, "Digit0");
});

test("US punctuation codes match the legacy layout", () => {
  const expected = {
    ";": 186,
    ":": 186,
    "=": 187,
    "+": 187,
    ",": 188,
    "<": 188,
    "-": 189,
    _: 189,
    ".": 190,
    ">": 190,
    "/": 191,
    "?": 191,
    "`": 192,
    "~": 192,
    "[": 219,
    "{": 219,
    "\\": 220,
    "|": 220,
    "]": 221,
    "}": 221,
    "'": 222,
    '"': 222,
  };

  for (const [char, keyCode] of Object.entries(expected)) {
    const descriptor = map.lookup(char);
    assert.ok(descriptor, `missing ${JSON.stringify(char)}`);
    assert.equal(descriptor.keyCode, keyCode, `${JSON.stringify(char)} keyCode`);
    assert.equal(descriptor.key, char, `${JSON.stringify(char)} key`);
    assert.equal(descriptor.charCode, char.codePointAt(0));
  }
});

test("whitespace maps to the keys that actually produce it", () => {
  assert.deepEqual(map.lookup(" "), {
    key: " ",
    code: "Space",
    keyCode: 32,
    which: 32,
    charCode: 32,
    shiftKey: false,
    text: " ",
  });

  assert.equal(map.lookup("\n").key, "Enter");
  assert.equal(map.lookup("\n").keyCode, 13);
  assert.equal(map.lookup("\n").text, "\n");

  // CRLF snippets are normalised on import, but the map must not depend on that.
  assert.equal(map.lookup("\r").keyCode, 13);

  assert.equal(map.lookup("\t").key, "Tab");
  assert.equal(map.lookup("\t").keyCode, 9);
  assert.equal(map.lookup("\t").text, "\t");
});

test("named keys are reachable by their common spellings", () => {
  assert.equal(map.byName("Enter").keyCode, 13);
  assert.equal(map.byName("return").keyCode, 13);
  assert.equal(map.byName("space").keyCode, 32);
  assert.equal(map.byName(" ").keyCode, 32);
  assert.equal(map.byName("pgdn").keyCode, 34);
  assert.equal(map.byName("arrowup").keyCode, 38);
  assert.equal(map.byName("esc").keyCode, 27);
  assert.equal(map.byName("nope"), null);
});

test("characters a US keyboard cannot produce return null", () => {
  for (const char of ["é", "ü", "€", "—", "😀", "\u0000", "\u0007", "ab", ""]) {
    assert.equal(map.lookup(char), null, `expected null for ${JSON.stringify(char)}`);
    assert.equal(map.isTypable(char), false);
  }
  assert.equal(map.isTypable("a"), true);
});

test("descriptors are frozen and internally consistent", () => {
  for (const char of map.printableChars()) {
    const descriptor = map.lookup(char);
    assert.ok(Object.isFrozen(descriptor), `${JSON.stringify(char)} is mutable`);
    assert.equal(descriptor.which, descriptor.keyCode, `${JSON.stringify(char)} which`);
    assert.ok(Number.isInteger(descriptor.charCode));
    assert.equal(typeof descriptor.text, "string");
  }

  // Shift is a property of the *physical* key, so it is only true when the
  // produced character differs from the unshifted one.
  for (const char of "a1;") {
    assert.equal(map.lookup(char).shiftKey, false, char);
  }
  for (const char of "A!*") {
    assert.equal(map.lookup(char).shiftKey, true, char);
  }
});

test("the shift rule does not fire for punctuation that is not shifted", () => {
  // Non-shifted punctuation like ';' has key === char, so the shift flag must
  // stay false. This is the exact check that catches a table built with
  // "everything on the shifted row is shifted".
  assert.equal(map.lookup(";").shiftKey, false);
  assert.equal(map.lookup(":").shiftKey, true);
  assert.equal(map.lookup("/").shiftKey, false);
  assert.equal(map.lookup("?").shiftKey, true);
});
