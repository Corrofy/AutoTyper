/**
 * test/unit/textarea-adapter.test.js — the insertion ladder, without a browser.
 *
 * The adapter is deliberately written against a small element contract
 * (value/selection/maxLength/dispatchEvent), so Node can exercise the real
 * control flow: page-veto, execCommand, native-setter fallback, maxlength,
 * backspace boundaries, and replace mode.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "src");
require(path.join(SRC, "content", "engine", "keycode-map.js"));
require(path.join(SRC, "content", "injection", "dispatcher.js"));
require(path.join(SRC, "content", "injection", "adapters", "textarea.js"));

const AT = globalThis.AutoTyper;

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

/**
 * @param {object} options
 * @param {string} [options.value]
 * @param {"TEXTAREA"|"INPUT"} [options.tagName]
 * @param {(event: object) => void} [options.onEvent] observe/veto dispatched events
 * @param {(command: string, showUi: boolean, value?: string) => boolean} [options.exec]
 */
function harness({ value = "", tagName = "TEXTAREA", type = "", maxLength = -1, onEvent, exec } = {}) {
  const win = fakeWindow();
  const proto = tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  const element = Object.create(proto);
  element.nodeType = 1;
  element.tagName = tagName;
  element.type = type;
  element.maxLength = maxLength;
  element.disabled = false;
  element.readOnly = false;
  element.isConnected = true;
  element.value = value;
  element.selectionStart = value.length;
  element.selectionEnd = value.length;
  element.events = [];
  element.focused = 0;
  element.focus = () => {
    element.focused += 1;
  };
  element.setSelectionRange = (start, end = start) => {
    if (tagName === "INPUT" && type === "email") throw new Error("InvalidStateError");
    element.selectionStart = start;
    element.selectionEnd = end;
  };
  element.dispatchEvent = (event) => {
    element.events.push(event);
    if (onEvent) onEvent(event, element);
    return !event.defaultPrevented;
  };

  const dispatcher = AT.dispatcher.createDispatcher({ window: win });
  const adapter = AT.createTextareaAdapter({
    dispatcher,
    keycodeMap: AT.keycodeMap,
    execCommand: exec || (() => false),
  });

  return { element, adapter, dispatcher, types: () => element.events.map((event) => event.type) };
}

test("helpers: insertionFor clamps a stale selection", () => {
  const { insertionFor } = AT.textareaAdapterHelpers;
  assert.deepEqual(insertionFor("abc", 0, 0, "x"), { value: "xabc", caret: 1, from: 0, to: 0 });
  assert.deepEqual(insertionFor("abc", 1, 2, "xy"), { value: "axyc", caret: 3, from: 1, to: 2 });
  // A selection beyond the end is clamped rather than producing undefined text.
  assert.deepEqual(insertionFor("abc", 99, 120, "!"), { value: "abc!", caret: 4, from: 3, to: 3 });
});

test("helpers: previousBoundary removes a whole astral character", () => {
  const { previousBoundary } = AT.textareaAdapterHelpers;
  assert.equal(previousBoundary("abc", 3), 2);
  assert.equal(previousBoundary("abc", 0), 0);
  assert.equal(previousBoundary("😀", 2), 0);
  assert.equal(previousBoundary("a😀", 3), 1);
});

test("helpers: isTextControl rejects non-text input types", () => {
  const { isTextControl } = AT.textareaAdapterHelpers;
  const base = { nodeType: 1, disabled: false, readOnly: false, tagName: "INPUT" };
  assert.equal(isTextControl({ ...base, type: "text" }), true);
  assert.equal(isTextControl({ ...base, type: "number" }), false);
  assert.equal(isTextControl({ ...base, type: "checkbox" }), false);
  assert.equal(isTextControl({ ...base, tagName: "TEXTAREA", type: "" }), true);
  assert.equal(isTextControl({ ...base, tagName: "DIV", type: "" }), false);
});

test("insert: native-setter rung fires the full key/input sequence", () => {
  const { element, adapter, types } = harness();

  const result = adapter.insert(element, "a");

  assert.equal(result.ok, true);
  assert.equal(result.via, "native");
  assert.equal(element.value, "a");
  assert.equal(element.selectionStart, 1);
  assert.deepEqual(types(), ["keydown", "keypress", "beforeinput", "input", "keyup"]);

  const keydown = element.events[0];
  assert.equal(keydown.key, "a");
  assert.equal(keydown.code, "KeyA");
  assert.equal(keydown.keyCode, 65);
  assert.equal(keydown.which, 65);

  const input = element.events.find((event) => event.type === "input");
  assert.equal(input.data, "a");
  assert.equal(input.inputType, "insertText");
});

test("insert: execCommand rung wins when it changes the value", () => {
  let element;
  const exec = (command, showUi, value) => {
    if (command !== "insertText") return false;
    element.value += value;
    element.events.push({ type: "input", inputType: "insertText", data: value });
    return true;
  };
  const h = harness({ exec });
  element = h.element;

  const result = h.adapter.insert(element, "z");

  assert.equal(result.ok, true);
  assert.equal(result.via, "exec");
  assert.equal(element.value, "z");
  // Exactly one input: the fake exec's native one. The adapter must not add a
  // second manual input on this rung.
  assert.equal(h.types().filter((type) => type === "input").length, 1);
  assert.deepEqual(h.types(), ["keydown", "keypress", "input", "keyup"]);
});

test("insert: a page that mutates on keydown owns the edit", () => {
  const h = harness({
    onEvent: (event, element) => {
      if (event.type === "keydown" && event.key === "a") element.value += "PAGE";
    },
  });

  const result = h.adapter.insert(h.element, "a");

  assert.equal(result.ok, true);
  assert.equal(result.via, "page");
  assert.equal(h.element.value, "PAGE");
  // No second insertion, no manual input event.
  assert.deepEqual(h.types(), ["keydown", "keypress", "keyup"]);
});

test("insert: a cancelled keydown stops before touching the value", () => {
  const h = harness({
    onEvent: (event) => {
      if (event.type === "keydown") event.preventDefault();
    },
  });

  const result = h.adapter.insert(h.element, "a");

  assert.equal(result.ok, false);
  assert.equal(result.reason, "page-blocked");
  assert.equal(h.element.value, "");
  // keyup still happens, exactly as a real keyboard would.
  assert.deepEqual(h.types(), ["keydown", "keyup"]);
});

test("insert: a cancelled beforeinput is respected", () => {
  const h = harness({
    onEvent: (event) => {
      if (event.type === "beforeinput") event.preventDefault();
    },
  });

  const result = h.adapter.insert(h.element, "a");

  assert.equal(result.ok, false);
  assert.equal(result.reason, "page-blocked");
  assert.equal(h.element.value, "");
  assert.deepEqual(h.types(), ["keydown", "keypress", "beforeinput", "keyup"]);
});

test("insert: maxlength is enforced instead of bypassed by the setter", () => {
  const h = harness({ value: "abc", maxLength: 3 });

  const result = h.adapter.insert(h.element, "d");

  assert.equal(result.ok, false);
  assert.equal(result.reason, "maxlength");
  assert.equal(h.element.value, "abc");
});

test("insert: replacing a selection may still fit within maxlength", () => {
  const h = harness({ value: "abc", maxLength: 3 });
  h.element.selectionStart = 1;
  h.element.selectionEnd = 3;

  const result = h.adapter.insert(h.element, "X");

  assert.equal(result.ok, true);
  assert.equal(h.element.value, "aX");
});

test("insert: characters no US key produces use the text-only path", () => {
  const h = harness();

  const result = h.adapter.insert(h.element, "😀");

  assert.equal(result.ok, true);
  assert.equal(result.via, "native-text");
  assert.equal(h.element.value, "😀");
  assert.deepEqual(h.types(), ["beforeinput", "input"]);
});

test("insert: a removed element is reported, not written to", () => {
  const h = harness();
  h.element.isConnected = false;

  const result = h.adapter.insert(h.element, "a");

  assert.equal(result.ok, false);
  assert.equal(result.reason, "detached");
  assert.equal(h.element.value, "");
});

test("backspace: removes one character and reports the native input type", () => {
  const h = harness({ value: "ab" });

  const result = h.adapter.backspace(h.element);

  assert.equal(result.ok, true);
  assert.equal(h.element.value, "a");
  assert.equal(h.element.selectionStart, 1);
  const input = h.element.events.find((event) => event.type === "input");
  assert.equal(input.inputType, "deleteContentBackward");
  assert.deepEqual(h.types(), ["keydown", "beforeinput", "input", "keyup"]);
});

test("backspace: removes a surrogate pair as one character", () => {
  const h = harness({ value: "😀" });

  const result = h.adapter.backspace(h.element);

  assert.equal(result.ok, true);
  assert.equal(h.element.value, "");
});

test("backspace: deletes the selection instead of one character", () => {
  const h = harness({ value: "abcdef" });
  h.element.selectionStart = 1;
  h.element.selectionEnd = 4;

  const result = h.adapter.backspace(h.element);

  assert.equal(result.ok, true);
  assert.equal(h.element.value, "aef");
  assert.equal(h.element.selectionStart, 1);
});

test("backspace: refuses to delete text before the run start", () => {
  const h = harness({ value: "abc" });
  h.element.selectionStart = 0;
  h.element.selectionEnd = 0;

  const result = h.adapter.backspace(h.element);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "start-of-document");
  assert.equal(h.element.value, "abc");
});

test("prepare: replace mode selects inside the control before deleting", () => {
  let observed = null;
  let element;
  const exec = (command) => {
    if (command !== "delete") return false;
    observed = { start: element.selectionStart, end: element.selectionEnd };
    element.value = "";
    element.events.push({ type: "input", inputType: "deleteContent" });
    return true;
  };
  const h = harness({ value: "old text", exec });
  element = h.element;

  const result = h.adapter.prepare(element, "replace");

  assert.equal(result.ok, true);
  assert.equal(result.via, "exec");
  assert.deepEqual(observed, { start: 0, end: 8 });
  assert.equal(element.value, "");
  assert.equal(h.types().filter((type) => type === "input").length, 1);
});

test("prepare: replace mode falls back to the native setter", () => {
  const h = harness({ value: "old text" });

  const result = h.adapter.prepare(h.element, "replace");

  assert.equal(result.ok, true);
  assert.equal(result.via, "native");
  assert.equal(h.element.value, "");
  const input = h.element.events.find((event) => event.type === "input");
  assert.equal(input.inputType, "deleteContent");
});

test("prepare: insert mode is a no-op", () => {
  const h = harness({ value: "keep me" });

  const result = h.adapter.prepare(h.element, "insert");

  assert.equal(result.ok, true);
  assert.equal(result.cleared, false);
  assert.equal(h.element.value, "keep me");
  assert.deepEqual(h.types(), []);
});

test("supportsNewline is true only for a textarea", () => {
  const textarea = harness({ tagName: "TEXTAREA" });
  const input = harness({ tagName: "INPUT", type: "text" });

  assert.equal(textarea.adapter.supportsNewline(textarea.element), true);
  assert.equal(input.adapter.supportsNewline(input.element), false);
});
