/**
 * content/focus-tracker.js — remembers the last editable element in THIS frame.
 *
 * Why not just read `document.activeElement` when the hotkey fires?
 *   Because by then focus has usually moved. Opening the popup, clicking the
 *   floating widget, or pressing a chord that the page handles can blur the
 *   editor. The engine needs the element the user *meant*, not the element that
 *   happens to be focused at decision time.
 *
 * Why per frame?
 *   `all_frames: true` means an editor may live inside an iframe (CodeSandbox,
 *   StackBlitz, embedded playgrounds). Keydown arrives in the focused frame, so
 *   each frame must know its own target.
 *
 * Deliberately does NOT clear the target on blur: clicking our own overlay would
 * otherwise discard the very element we are about to type into.
 *
 * Depends on: shared/protocol.js
 */

(function (global) {
  "use strict";

  const AT = global.AutoTyper;
  if (!AT || !AT.protocol) throw new Error("Auto Typer: focus-tracker.js loaded before protocol.js");

  /** Input types that accept free text. Buttons/checkboxes/files do not. */
  const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password", "number"]);

  /** Elements the engine must never target. */
  function isOurOwnUi(element) {
    if (typeof element.closest !== "function") return false;
    if (element.closest("[data-auto-typer-host]")) return true;
    // Anything living inside a shadow root is not a page-level input, unless the
    // page itself uses shadow DOM for its editor. Distinguish by our host marker.
    const root = element.getRootNode && element.getRootNode();
    return Boolean(root && root.host && root.host.hasAttribute && root.host.hasAttribute("data-auto-typer-host"));
  }

  function isEditable(element) {
    if (!element || element.nodeType !== 1) return false;
    if (isOurOwnUi(element)) return false;
    if (element.disabled || element.readOnly) return false;

    const tag = element.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") return TEXT_INPUT_TYPES.has((element.type || "").toLowerCase());
    if (element.isContentEditable) return true;
    // Explicit textbox roles (ARIA editors, custom widgets).
    const role = element.getAttribute && element.getAttribute("role");
    return role === "textbox" || role === "searchbox";
  }

  /** Short human-readable description used by the overlay and the popup. */
  function describe(element) {
    if (!element) return "No field focused";
    if (!element.isConnected) return "Target was removed from the page";

    const tag = element.tagName.toLowerCase();
    if (element.isContentEditable && tag !== "textarea") return `contenteditable ${tag}`;

    const type = tag === "input" ? element.type || "text" : "";
    const hint =
      element.getAttribute("aria-label") ||
      element.getAttribute("placeholder") ||
      element.getAttribute("name") ||
      element.id ||
      "";
    const suffix = hint ? ` · ${String(hint).trim().slice(0, 28)}` : "";
    return `${tag}${type && type !== "textarea" ? `[${type}]` : ""}${suffix}`;
  }

  /**
   * @param {object} options
   * @param {(target: Element|null) => void} options.onChange
   * @param {number} [options.settleMs] debounce so fast focus churn is coalesced
   */
  AT.createFocusTracker = function createFocusTracker({ onChange, settleMs = 120 } = {}) {
    let target = null;
    let timer = 0;

    function announce() {
      timer = 0;
      // Drop a stale reference if the page re-rendered the editor away.
      if (target && !target.isConnected) target = null;
      if (typeof onChange === "function") onChange(target);
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(announce, settleMs);
    }

    // Capture phase: editors frequently stop propagation on focus events.
    function onFocusIn(event) {
      const candidate = event.target;
      if (!isEditable(candidate)) return;
      if (candidate === target) return;
      target = candidate;
      schedule();
    }

    // If our target is removed while focused, do not keep a dead reference.
    function onFocusOut(event) {
      if (!target || event.target !== target) return;
      // Do not clear immediately: the new focus may be the page body (click on
      // the overlay). Only drop the target when it leaves the document.
      setTimeout(() => {
        if (target && !target.isConnected) {
          target = null;
          schedule();
        }
      }, 0);
    }

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);

    return {
      /** The element the engine should type into, or null. */
      getTarget() {
        if (target && !target.isConnected) target = null;
        return target;
      },
      describe(element) {
        return describe(element || this.getTarget());
      },
      /** Re-run detection, e.g. after a settings change or a page mutation. */
      refresh: schedule,
      destroy() {
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", onFocusOut, true);
        if (timer) clearTimeout(timer);
      },
    };
  };

  AT.focusTrackerHelpers = Object.freeze({ isEditable, describe, isOurOwnUi });
})(globalThis);
