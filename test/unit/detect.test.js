/**
 * test/unit/detect.test.js — adapter registry ordering and resilience.
 *
 * The ordering rule matters in M4: CodeMirror 5 and Ace keep a real <textarea>
 * in the page, so the generic adapter must lose to the editor adapter that was
 * registered after it.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require(path.join(__dirname, "..", "..", "src", "content", "injection", "detect.js"));

const { createAdapterRegistry } = globalThis.AutoTyper;

function adapter(name, matches, insert = () => ({ ok: true })) {
  return { name, matches, insert };
}

function element(tagName) {
  return { nodeType: 1, tagName };
}

test("detect returns null for a non-element", () => {
  const registry = createAdapterRegistry();
  registry.register(adapter("any", () => true));
  assert.equal(registry.detect(null), null);
  assert.equal(registry.detect({ nodeType: 3 }), null);
});

test("the most recently registered adapter wins", () => {
  const registry = createAdapterRegistry();
  const generic = registry.register(adapter("textarea", (el) => el.tagName === "TEXTAREA"));
  const cm5 = registry.register(adapter("cm5", (el) => el.tagName === "TEXTAREA"));

  assert.equal(registry.detect(element("TEXTAREA")), cm5);
  assert.notEqual(registry.detect(element("TEXTAREA")), generic);
});

test("re-registering a name replaces the old adapter instead of duplicating it", () => {
  const registry = createAdapterRegistry();
  const first = registry.register(adapter("textarea", () => true));
  const second = registry.register(adapter("textarea", () => true));

  assert.equal(registry.list().length, 1);
  assert.equal(registry.list()[0], second);
  assert.notEqual(first, second);
});

test("a throwing matcher does not hide later adapters", () => {
  const registry = createAdapterRegistry();
  registry.register(adapter("textarea", () => true));
  registry.register(
    adapter("broken", () => {
      throw new Error("editor not ready");
    }),
  );

  assert.equal(registry.detect(element("TEXTAREA")).name, "textarea");
});

test("a non-matching element is reported as unsupported", () => {
  const registry = createAdapterRegistry();
  registry.register(adapter("textarea", (el) => el.tagName === "TEXTAREA"));
  assert.equal(registry.detect(element("DIV")), null);
});

test("register rejects an adapter without the run contract", () => {
  const registry = createAdapterRegistry();
  assert.throws(() => registry.register({ name: "x" }), TypeError);
  assert.throws(() => registry.register({ name: "x", matches: () => true }), TypeError);
  assert.throws(() => registry.register(null), TypeError);
});
