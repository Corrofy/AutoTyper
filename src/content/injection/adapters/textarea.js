/**
 * content/injection/adapters/textarea.js — plain <textarea> / text <input>.
 *
 * THE CENTRAL FACT (plan.md §5.2)
 *   A synthetic `keydown` notifies listeners but the browser never edits the
 *   field, because the event is untrusted. Every character therefore needs two
 *   things: the event sequence, so the page's own model sees a keystroke, and an
 *   actual mutation, so the field changes. This adapter is where those meet.
 *
 * THE INSERTION LADDER (plan.md §5.3)
 *   1. keydown / keypress. If the page cancels keydown, we stop: it said "no".
 *   2. If the page's handler already changed the value, do nothing more. Some
 *      widgets really do handle keystrokes themselves.
 *   3. `document.execCommand("insertText")` — deprecated, but it is the only
 *      portable way to route text through the browser's editing pipeline, which
 *      preserves the undo stack, fires native `beforeinput`/`input`, and respects
 *      maxlength. React still sees it, because the value changes behind React's
 *      value tracker (§5.4).
 *   4. Native prototype setter + manual `beforeinput`/`input`. This is the
 *      React-compatible path, and the fallback when execCommand is unavailable
 *      or refuses (non-focused document, unsupported input type).
 *   5. No change at all → report failure; the runner stops instead of spinning.
 *
 * WHY NOT ASSIGN `el.value = ...` DIRECTLY
 *   React wraps the node's `value` accessor with its tracker; a direct assignment
 *   updates the tracker, so React concludes nothing changed and never calls
 *   `onChange`. The prototype setter bypasses that wrapper deliberately.
 *
 * Depends on: content/injection/dispatcher.js, content/engine/keycode-map.js.
 * Pure helpers are exported for Node tests; nothing touches the DOM at load time.
 */

(function (global) {
  "use strict";

  const AT = global.AutoTyper;
  if (!AT) throw new Error("Auto Typer: textarea adapter loaded before the namespace");

  /** Input types that accept free text. `number` is deliberately absent. */
  const TEXT_INPUT_TYPES = Object.freeze(new Set(["", "text", "search", "email", "url", "tel", "password"]));

  function isTextControl(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.disabled || element.readOnly) return false;
    if (element.tagName === "TEXTAREA") return true;
    if (element.tagName === "INPUT") return TEXT_INPUT_TYPES.has(String(element.type || "").toLowerCase());
    return false;
  }

  /** Clamp a selection to the value, then splice text into it. */
  function insertionFor(value, start, end, text) {
    const length = value.length;
    const rawStart = Number.isFinite(start) ? start : length;
    const rawEnd = Number.isFinite(end) ? end : rawStart;
    const from = Math.max(0, Math.min(rawStart, length));
    const to = Math.max(from, Math.min(rawEnd, length));
    return {
      value: value.slice(0, from) + text + value.slice(to),
      caret: from + text.length,
      from,
      to,
    };
  }

  /**
   * Index of the code point before `index`, not the UTF-16 unit.
   * A backspace on an emoji must remove the whole emoji, not half of a surrogate
   * pair (which would leave a lone surrogate and corrupt the field).
   */
  function previousBoundary(value, index) {
    if (index <= 0) return 0;
    const start = Math.min(index, value.length);
    const low = value.charCodeAt(start - 1);
    if (low >= 0xdc00 && low <= 0xdfff && start >= 2) {
      const high = value.charCodeAt(start - 2);
      if (high >= 0xd800 && high <= 0xdbff) return start - 2;
    }
    return start - 1;
  }

  /**
   * @param {object} deps
   * @param {ReturnType<typeof AT.dispatcher.createDispatcher>} deps.dispatcher
   * @param {typeof AT.keycodeMap} deps.keycodeMap
   * @param {(command: string, showUi?: boolean, value?: string) => boolean} [deps.execCommand]
   *   injected by tests; defaults to the page document's execCommand
   */
  function createTextareaAdapter({ dispatcher, keycodeMap, execCommand } = {}) {
    if (!dispatcher || !keycodeMap) {
      throw new TypeError("createTextareaAdapter: dispatcher and keycodeMap are required");
    }

    function runExec(command, value) {
      const fn =
        execCommand ||
        (typeof global.document === "object" && global.document && typeof global.document.execCommand === "function"
          ? global.document.execCommand.bind(global.document)
          : null);
      if (!fn) return false;
      try {
        return value === undefined ? fn(command, false) : fn(command, false, value);
      } catch {
        // Firefox throws in some sandboxed contexts; a thrown command is simply a
        // failed rung, never a crash.
        return false;
      }
    }

    function selectionOf(element) {
      const value = element.value;
      let start = value.length;
      let end = value.length;
      try {
        if (typeof element.selectionStart === "number") start = element.selectionStart;
        if (typeof element.selectionEnd === "number") end = element.selectionEnd;
      } catch {
        // Some input types throw on selectionStart; appending is the safe default.
      }
      if (!Number.isFinite(start) || start < 0) start = value.length;
      if (!Number.isFinite(end) || end < start) end = start;
      return { start, end };
    }

    function setSelection(element, start, end = start) {
      try {
        element.setSelectionRange(start, end);
      } catch {
        // email/number inputs do not implement selection ranges.
      }
    }

    function tooLong(element, nextValue) {
      const max = element.maxLength;
      return typeof max === "number" && max >= 0 && nextValue.length > max;
    }

    /** Fire keypress only where a real keyboard would: printable characters. */
    function dispatchKeypress(element, descriptor) {
      if (!descriptor || !descriptor.text || descriptor.text === "\n" || descriptor.text === "\t") return;
      dispatcher.key("keypress", element, descriptor);
    }

    function success(via, value) {
      return { ok: true, via, value };
    }

    function failure(reason, value) {
      return { ok: false, reason, value };
    }

    function insert(element, char) {
      if (!element || element.nodeType !== 1) return failure("detached");
      if (!element.isConnected) return failure("detached");

      const descriptor = keycodeMap.lookup(char);
      const before = element.value;
      const selection = selectionOf(element);

      try {
        if (descriptor) {
          const keydown = dispatcher.key("keydown", element, descriptor);
          if (keydown.defaultPrevented) return failure("page-blocked");

          dispatchKeypress(element, descriptor);

          // A widget that mutates on keydown owns the edit; do not double-insert.
          if (element.value !== before) return success("page", element.value);

          // Rung 3: browser editing pipeline (undo stack, native input events).
          if (runExec("insertText", char) && element.value !== before) {
            return success("exec", element.value);
          }

          // Rung 4a: ask permission with beforeinput, then mutate ourselves.
          const veto = dispatcher.beforeInput(element, descriptor, "insertText");
          if (veto.defaultPrevented) return failure("page-blocked");
          if (element.value !== before) return success("page", element.value);
        } else {
          // No physical US key produces this character. Announce the insertion
          // without pretending a key existed, then mutate.
          const veto = dispatcher.beforeInput(element, { text: char }, "insertText");
          if (veto.defaultPrevented) return failure("page-blocked");
          if (element.value !== before) return success("page", element.value);
        }

        const next = insertionFor(element.value, selection.start, selection.end, char);
        if (tooLong(element, next.value)) return failure("maxlength");

        dispatcher.setNativeValue(element, next.value);
        setSelection(element, next.caret);
        if (element.value === before) return failure("no-change");

        dispatcher.input(element, descriptor || { text: char }, "insertText");
        return success(descriptor ? "native" : "native-text", element.value);
      } finally {
        // keyup is a real event even when the edit was vetoed.
        if (descriptor) dispatcher.key("keyup", element, descriptor);
      }
    }

    function backspace(element) {
      if (!element || element.nodeType !== 1) return failure("detached");
      if (!element.isConnected) return failure("detached");

      const descriptor = keycodeMap.byName("Backspace");
      const before = element.value;
      const selection = selectionOf(element);

      try {
        const keydown = dispatcher.key("keydown", element, descriptor);
        if (keydown.defaultPrevented) return failure("page-blocked");
        if (element.value !== before) return success("page", element.value);

        if (selection.start === 0 && selection.end === 0) return failure("start-of-document");

        const veto = dispatcher.beforeInput(element, descriptor, "deleteContentBackward");
        if (veto.defaultPrevented) return failure("page-blocked");
        if (element.value !== before) return success("page", element.value);

        const from = selection.start === selection.end ? previousBoundary(before, selection.start) : selection.start;
        const nextValue = before.slice(0, from) + before.slice(selection.end);

        dispatcher.setNativeValue(element, nextValue);
        setSelection(element, from);
        if (element.value === before) return failure("no-change");

        dispatcher.input(element, descriptor, "deleteContentBackward");
        return success("native", element.value);
      } finally {
        dispatcher.key("keyup", element, descriptor);
      }
    }

    /**
     * Clear the target for replace-document mode.
     *
     * Select inside the control first, then `execCommand("delete")`: selecting
     * the whole *document* (or letting `selectAll` do it) and deleting would
     * wipe unrelated page content. If the command refuses, fall back to the
     * native setter. The manual path loses undo, which is recorded as a
     * limitation rather than hidden.
     */
    function prepare(element, mode) {
      if (mode !== "replace") return { ok: true, cleared: false, via: "none" };
      if (!element || !element.isConnected) return { ok: false, reason: "detached", cleared: false };

      const before = element.value;
      if (!before) return { ok: true, cleared: true, via: "empty" };

      try {
        element.focus({ preventScroll: true });
      } catch {
        /* focus options unsupported; the element is already the target */
      }

      setSelection(element, 0, before.length);
      if (runExec("delete") && element.value === "") {
        return { ok: true, cleared: true, via: "exec" };
      }

      dispatcher.setNativeValue(element, "");
      setSelection(element, 0);
      if (element.value !== "") return { ok: false, reason: "no-change", cleared: false };

      dispatcher.input(element, { text: "" }, "deleteContent");
      return { ok: true, cleared: true, via: "native" };
    }

    return {
      name: "textarea",
      matches: isTextControl,
      supportsNewline(element) {
        return Boolean(element) && element.tagName === "TEXTAREA";
      },
      snapshot(element) {
        const selection = selectionOf(element);
        return { value: element.value, start: selection.start, end: selection.end };
      },
      prepare,
      insert,
      backspace,
    };
  }

  AT.createTextareaAdapter = createTextareaAdapter;
  AT.textareaAdapterHelpers = Object.freeze({
    TEXT_INPUT_TYPES,
    isTextControl,
    insertionFor,
    previousBoundary,
  });
})(globalThis);
