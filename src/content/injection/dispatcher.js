/**
 * content/injection/dispatcher.js — build and dispatch web-platform events.
 *
 * WHY THIS IS SEPARATE FROM THE ADAPTER
 *   An adapter decides *what* should happen to an editor. The dispatcher knows
 *   *how* to make the browser announce it. Keeping them apart means M4's Monaco
 *   and CodeMirror adapters reuse the exact event-construction rules that M2's
 *   textarea adapter was tested against.
 *
 * THE LEGACY-FIELD PROBLEM (plan.md §5.1)
 *   `new KeyboardEvent("keydown", { keyCode: 65 })` produces `keyCode === 0`:
 *   the legacy fields are not in the constructor's init dictionary, even though
 *   editors still read them. So we construct with the standard fields and then
 *   define `keyCode`, `which`, and `charCode` as own properties on the event
 *   instance. `Object.defineProperty` shadows the inherited accessors and works
 *   in both engines; relying on the constructor would silently fail in one.
 *
 *   `inputInit()` is pure for the same reason `keyInit()` is: Node tests can
 *   assert the exact init dictionary without a DOM.
 *
 * Depends on: nothing (creates the namespace if absent, for Node tests).
 */

(function (global) {
  "use strict";

  const AT = (global.AutoTyper = global.AutoTyper || {});

  /** Fields every synthetic keyboard event carries, from a key descriptor. */
  function keyInit(descriptor, { ctrlKey = false, altKey = false, metaKey = false } = {}) {
    return {
      key: descriptor.key,
      code: descriptor.code,
      location: 0,
      repeat: false,
      isComposing: false,
      ctrlKey,
      altKey,
      shiftKey: Boolean(descriptor.shiftKey),
      metaKey,
    };
  }

  /**
   * The legacy triple, per event type.
   *
   * A real keydown/keyup reports `charCode === 0`; only keypress carries the
   * character code. `which` follows the same rule (`keyCode` on keydown,
   * `charCode` on keypress). The keycode map describes the *key press*; the
   * dispatcher is responsible for reporting the right numbers on the right event.
   */
  function legacyFields(descriptor, type = "keydown") {
    if (type === "keypress") {
      return {
        keyCode: descriptor.keyCode,
        which: descriptor.charCode || descriptor.keyCode,
        charCode: descriptor.charCode,
      };
    }
    return {
      keyCode: descriptor.keyCode,
      which: descriptor.keyCode,
      charCode: 0,
    };
  }

  /**
   * InputEvent init.
   *
   * `inputType` and `data` are what React, CodeMirror and Monaco actually read.
   * `cancelable` is false for `input` (nothing can undo it) and true for
   * `beforeinput` (the page may veto the edit) — the caller decides.
   */
  function inputInit(descriptor, { inputType = "insertText", cancelable = false } = {}) {
    return {
      data: descriptor && descriptor.text ? descriptor.text : null,
      inputType,
      isComposing: false,
      bubbles: true,
      cancelable,
      composed: true,
    };
  }

  /**
   * @param {object} [options]
   * @param {Window} [options.window] injected for tests; defaults to globalThis
   */
  function createDispatcher({ window: win = global } = {}) {
    if (!win || typeof win.KeyboardEvent !== "function" || typeof win.InputEvent !== "function") {
      throw new TypeError("createDispatcher: a window with KeyboardEvent and InputEvent is required");
    }

    /** Define the legacy fields on the instance, never on the prototype. */
    function applyLegacyFields(event, descriptor, type) {
      for (const [name, value] of Object.entries(legacyFields(descriptor, type))) {
        try {
          Object.defineProperty(event, name, {
            value,
            configurable: true,
            enumerable: true,
            writable: false,
          });
        } catch {
          // A host object that refuses the property is still usable through
          // `key`/`code`; never abort a keystroke over a cosmetic field.
        }
      }
      return event;
    }

    function key(type, target, descriptor, modifiers) {
      const event = new win.KeyboardEvent(type, keyInit(descriptor, modifiers));
      applyLegacyFields(event, descriptor, type);
      target.dispatchEvent(event);
      return event;
    }

    function input(target, descriptor, inputType = "insertText") {
      const event = new win.InputEvent("input", inputInit(descriptor, { inputType }));
      target.dispatchEvent(event);
      return event;
    }

    function beforeInput(target, descriptor, inputType = "insertText") {
      const event = new win.InputEvent("beforeinput", inputInit(descriptor, { inputType, cancelable: true }));
      target.dispatchEvent(event);
      return event;
    }

    /**
     * Set `.value` through the prototype's native setter.
     *
     * React installs an own `value` accessor on the node as its "value tracker".
     * Assigning `el.value = next` goes through that accessor, updates the
     * tracker, and React then believes nothing changed. Calling the prototype
     * setter bypasses the tracker; the following `input` event makes React
     * compare its stale tracked value with the DOM and fire `onChange`.
     * (plan.md §5.4)
     */
    function setNativeValue(target, value) {
      const ctor =
        target.tagName === "TEXTAREA"
          ? win.HTMLTextAreaElement
          : target.tagName === "INPUT"
            ? win.HTMLInputElement
            : null;
      const descriptor = ctor && Object.getOwnPropertyDescriptor(ctor.prototype, "value");
      if (descriptor && typeof descriptor.set === "function") {
        descriptor.set.call(target, value);
      } else {
        target.value = value;
      }
    }

    return { window: win, key, input, beforeInput, setNativeValue };
  }

  AT.dispatcher = Object.freeze({
    keyInit,
    inputInit,
    legacyFields,
    createDispatcher,
  });
})(globalThis);
