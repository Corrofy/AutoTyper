/**
 * content/injection/detect.js — which adapter should handle this element?
 *
 * Plain detection today; an escalation ladder later. The contract is
 * deliberately tiny so M4 can add Monaco/CodeMirror/Ace without the runner
 * learning anything about them.
 *
 * ORDERING: the most recently registered adapter wins. Editors like CodeMirror
 * 5 and Ace hide a real <textarea> in the page, so a generic textarea adapter
 * would otherwise claim the element before the editor adapter ever sees it. M4
 * registers editor adapters after the textarea one and gets priority for free.
 *
 * `createRegistry()` exists so unit tests get an isolated registry; the shipped
 * content world uses the single default `AT.detect`.
 *
 * Depends on: nothing beyond the namespace.
 */

(function (global) {
  "use strict";

  const AT = (global.AutoTyper = global.AutoTyper || {});

  function createRegistry() {
    /** @type {Array<{name: string, matches: (el: Element) => boolean}>} */
    const adapters = [];

    function register(adapter) {
      if (!adapter || typeof adapter.matches !== "function") {
        throw new TypeError("register: adapter must expose matches(element)");
      }
      if (typeof adapter.insert !== "function") {
        throw new TypeError("register: adapter must expose insert(element, char)");
      }
      // Re-registration (a re-injected content script) must not grow the list.
      const existing = adapters.findIndex((candidate) => candidate.name === adapter.name);
      if (existing >= 0) adapters.splice(existing, 1);
      adapters.push(adapter);
      return adapter;
    }

    /**
     * @param {Element|null} element
     * @returns {object|null} the adapter that claims the element
     */
    function detect(element) {
      if (!element || element.nodeType !== 1) return null;
      for (let index = adapters.length - 1; index >= 0; index -= 1) {
        try {
          if (adapters[index].matches(element)) return adapters[index];
        } catch {
          // One broken adapter must not make every other editor undetectable.
        }
      }
      return null;
    }

    return {
      register,
      detect,
      /** Registration order, oldest first. Used by diagnostics in M6. */
      list() {
        return adapters.slice();
      },
      clear() {
        adapters.length = 0;
      },
    };
  }

  AT.createAdapterRegistry = createRegistry;
  AT.detect = createRegistry();
})(globalThis);
