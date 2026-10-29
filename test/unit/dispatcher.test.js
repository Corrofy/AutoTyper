/**
 * test/unit/dispatcher.test.js — event construction without a browser.
 *
 * The regression this guards: `new KeyboardEvent("keydown", { keyCode: 65 })`
 * yields `keyCode === 0`. The init builder must keep the standard fields, and the
 * legacy triple must come from the descriptor and be applied explicitly.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require(path.join(__dirname, "..", "..", "src", "content", "injection", "dispatcher.js"));
require(path.join(__dirname, "..", "..", "src", "content", "engine", "keycode-map.js"));

const { dispatcher, keycodeMap } = globalThis.AutoTyper;

function fakeWindow() {
  class FakeKeyboardEvent {
    constructor(type, init) {
      Object.assign(this, init);
      this.type = type;
      this.defaultPrevented = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
  }
  class FakeInputEvent {
    constructor(type, init) {
      Object.assign(this, init);
      this.type = type;
      this.defaultPrevented = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
  }
  class FakeTextArea {
    constructor() {
      this._value = "";
    }
    get value() {
      return this._value;
    }
    set value(next) {
      this._value = String(next);
    }
  }
  class FakeInput extends FakeTextArea {}
  return {
    KeyboardEvent: FakeKeyboardEvent,
    InputEvent: FakeInputEvent,
    HTMLTextAreaElement: FakeTextArea,
    HTMLInputElement: FakeInput,
  };
}

function fakeTarget(win, { tagName = "TEXTAREA", value = "" } = {}) {
  const ctor = tagName === "TEXTAREA" ? win.HTMLTextAreaElement : win.HTMLInputElement;
  const target = Object.create(ctor.prototype);
  target.tagName = tagName;
  target.value = value;
  target.events = [];
  target.dispatchEvent = (event) => {
    target.events.push(event);
    return !event.defaultPrevented;
  };
  return target;
}

test("keyInit carries the descriptor's standard fields", () => {
  const descriptor = keycodeMap.lookup("A");
  const init = dispatcher.keyInit(descriptor);

  assert.equal(init.key, "A");
  assert.equal(init.code, "KeyA");
  assert.equal(init.shiftKey, true);
  assert.equal(init.ctrlKey, false);
  assert.equal(init.altKey, false);
  assert.equal(init.metaKey, false);
  // keyCode is deliberately absent from the init dictionary.
  assert.equal("keyCode" in init, false);
});

test("keyInit accepts explicit modifiers", () => {
  const descriptor = keycodeMap.lookup("a");
  const init = dispatcher.keyInit(descriptor, { ctrlKey: true, altKey: true, metaKey: true });
  assert.equal(init.ctrlKey, true);
  assert.equal(init.altKey, true);
  assert.equal(init.metaKey, true);
  assert.equal(init.shiftKey, false);
});

test("legacyFields report the numbers the event type really carries", () => {
  const shifted = keycodeMap.lookup("!");

  // keydown/keyup: the key code, and charCode is always 0.
  assert.deepEqual(dispatcher.legacyFields(shifted, "keydown"), {
    keyCode: 49,
    which: 49,
    charCode: 0,
  });
  assert.deepEqual(dispatcher.legacyFields(shifted, "keyup"), {
    keyCode: 49,
    which: 49,
    charCode: 0,
  });
  // keypress: which and charCode agree, and describe the produced character.
  assert.deepEqual(dispatcher.legacyFields(shifted, "keypress"), {
    keyCode: 49,
    which: 33,
    charCode: 33,
  });
  // Defaulting to keydown keeps the pure helper safe for ad-hoc callers.
  assert.equal(dispatcher.legacyFields(shifted).charCode, 0);
});

test("dispatched key events define per-type legacy fields on the instance", () => {
  const win = fakeWindow();
  const d = dispatcher.createDispatcher({ window: win });
  const target = fakeTarget(win);
  const descriptor = keycodeMap.lookup("q");

  const down = d.key("keydown", target, descriptor);
  const press = d.key("keypress", target, descriptor);
  const up = d.key("keyup", target, descriptor);

  assert.equal(down.type, "keydown");
  assert.equal(down.key, "q");
  assert.equal(down.code, "KeyQ");
  assert.equal(down.keyCode, 81);
  assert.equal(down.which, 81);
  assert.equal(down.charCode, 0);
  assert.equal(down.isTrusted, undefined, "the fake proves we did not rely on a real event");

  assert.equal(press.keyCode, 81);
  assert.equal(press.which, 113);
  assert.equal(press.charCode, 113);

  assert.equal(up.keyCode, 81);
  assert.equal(up.which, 81);
  assert.equal(up.charCode, 0);

  // Own properties, not inherited ones: that is the whole point.
  for (const event of [down, press, up]) {
    assert.equal(Object.hasOwn(event, "keyCode"), true);
    assert.equal(Object.hasOwn(event, "which"), true);
    assert.equal(Object.hasOwn(event, "charCode"), true);
  }
});

test("input init types match the contract", () => {
  const descriptor = keycodeMap.lookup("a");
  const init = dispatcher.inputInit(descriptor, { inputType: "insertText" });

  assert.equal(init.data, "a");
  assert.equal(init.inputType, "insertText");
  assert.equal(init.bubbles, true);
  assert.equal(init.cancelable, false);
  assert.equal(init.composed, true);
});

test("beforeinput is cancelable and input is not", () => {
  const win = fakeWindow();
  const d = dispatcher.createDispatcher({ window: win });
  const target = fakeTarget(win);
  const descriptor = keycodeMap.lookup("a");

  const before = d.beforeInput(target, descriptor, "insertText");
  const input = d.input(target, descriptor, "insertText");

  assert.equal(before.type, "beforeinput");
  assert.equal(before.cancelable, true);
  assert.equal(input.type, "input");
  assert.equal(input.cancelable, false);
});

test("setNativeValue writes through the prototype setter", () => {
  const win = fakeWindow();
  const d = dispatcher.createDispatcher({ window: win });
  const target = fakeTarget(win);

  // Mimic React's value tracker: an own accessor that would swallow a direct
  // assignment. The prototype setter must bypass it.
  let trackerValue = "";
  Object.defineProperty(target, "value", {
    configurable: true,
    get() {
      return win.HTMLTextAreaElement.prototype.__lookupGetter__("value").call(this);
    },
    set(next) {
      trackerValue = String(next);
      win.HTMLTextAreaElement.prototype.__lookupSetter__("value").call(this, next);
    },
  });

  target.value = "tracked";
  assert.equal(trackerValue, "tracked");

  d.setNativeValue(target, "bypassed");
  assert.equal(target.value, "bypassed");
  assert.equal(trackerValue, "tracked", "the tracker must not observe the native write");
});

test("a descriptor without a real key still has no legacy event", () => {
  // There is no descriptor for emoji, so the adapter must not dispatch a fake
  // keydown. This test documents that lookup returning null is the signal.
  assert.equal(keycodeMap.lookup("😀"), null);
});
