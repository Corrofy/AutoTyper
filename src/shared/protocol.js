/**
 * shared/protocol.js — namespace bootstrap, message vocabulary, API facade.
 *
 * WHY A NAMESPACE INSTEAD OF ES MODULES
 * Declarative content scripts cannot be ES modules in either browser, and the
 * usual workaround (a loader that dynamic-imports a module graph) is unreliable:
 * Chrome 130+ has open bugs with inter-module imports from content scripts, and
 * Firefox applies the *page's* CSP to extension module fetches. A bundler would
 * also work, but this project deliberately has no build-time dependencies.
 *
 * So the shipped code uses the classic-script pattern, which behaves identically
 * in a service worker, a Firefox event page, a content script, and an extension
 * page: one namespace object, explicit load order supplied by the caller
 * (manifest `js` array, background `scripts` array, or a `<script>` tag).
 *
 * Load order is declared in exactly two places: src/manifest.base.json and
 * build.mjs. build.mjs fails if they disagree.
 *
 * This file must stay dependency-free: everything else is loaded after it.
 */

(function (global) {
  "use strict";

  const AT = (global.AutoTyper = global.AutoTyper || {});

  // Re-injection (or a popup that also includes this file) must not reset state.
  if (AT.protocol) return;

  /**
   * Message vocabulary. Namespaced strings make message traffic greppable and
   * avoid collisions with any other listener in the same context.
   */
  const MESSAGES = Object.freeze({
    // popup/options → background
    SETTINGS_GET: "at:settings.get",
    SETTINGS_PATCH: "at:settings.patch",
    SETTINGS_RESET: "at:settings.reset",
    TAB_STATUS_GET: "at:tab.status.get",

    // content → background
    CONTENT_READY: "at:content.ready",
    TAB_REPORT: "at:tab.report",

    // background → content (reserved for M5, declared now so the vocabulary is
    // stable and the message-name set is visible in one place)
    RUN_START: "at:run.start",
    RUN_STOP: "at:run.stop",
    RUN_STATE: "at:run.state",
  });

  /** storage.local keys. One object per concern, so writes stay granular. */
  const STORAGE_KEYS = Object.freeze({
    SETTINGS: "settings",
    RUN: "run",
  });

  // Firefox exposes `browser` (promise-based) and `chrome` (callback-based);
  // Chromium exposes only `chrome`. Both support promises for the APIs used here
  // in MV3, so preferring `browser` gives identical semantics in both engines.
  const api = global.browser || global.chrome;

  if (!api) {
    // A plain web page, or a test environment without extension APIs.
    throw new Error("Auto Typer: extension APIs are unavailable in this context");
  }

  const PREFIX = "[auto-typer]";

  /**
   * Normalise anything thrown into a serialisable error envelope.
   * Message channels cannot carry Error objects or stacks.
   */
  function errorOf(err) {
    if (err && typeof err === "object" && "message" in err) {
      return {
        code: typeof err.code === "string" ? err.code : "E_UNKNOWN",
        message: String(err.message || "Unknown error"),
      };
    }
    return { code: "E_UNKNOWN", message: String(err) };
  }

  function makeError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  /**
   * Send a request to the background and unwrap the `{ok, data|error}` envelope.
   *
   * Every call is wrapped because a message to a context with no listener rejects
   * with an opaque browser error ("Could not establish connection..."). Callers
   * need to distinguish "the page has no content script" from "the handler threw".
   */
  async function send(type, payload) {
    let response;
    try {
      response = await api.runtime.sendMessage({ type, payload });
    } catch (err) {
      throw makeError(
        "E_NO_RECEIVER",
        `No background listener answered "${type}". Is the extension reloaded? (${
          err && err.message ? err.message : err
        })`,
      );
    }
    if (!response) {
      throw makeError("E_EMPTY_RESPONSE", `Empty response for "${type}"`);
    }
    if (response.ok === false) {
      const info = response.error || { code: "E_UNKNOWN", message: "Unknown error" };
      throw makeError(info.code, info.message);
    }
    return response.data;
  }

  /**
   * Register a message handler with a promise-aware contract.
   *
   * Chrome ignores a Promise returned from a listener, so the portable shape is
   * `sendResponse(...)` plus `return true`. This helper hides that detail: the
   * handler may return a plain value or a promise, and always emits the same
   * `{ok, data|error}` envelope that `send()` expects.
   *
   * IMPORTANT — returning `undefined` means "not mine, stay silent". A
   * `runtime.sendMessage()` reaches the background *and* every content script,
   * so if a content script answered messages addressed to the background it
   * could win the race and return the wrong data. Only a handler that produces a
   * value (including `null`) claims the message.
   */
  function onMessage(handler) {
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message.type !== "string") return false;
      // Only answer messages that belong to this extension's vocabulary; this
      // keeps us out of other extensions' traffic and out of internal APIs.
      if (!Object.values(MESSAGES).includes(message.type)) return false;

      let result;
      try {
        result = handler(message, sender);
      } catch (err) {
        sendResponse({ ok: false, error: errorOf(err) });
        return false;
      }

      if (result === undefined) return false; // not handled here

      if (result && typeof result.then === "function") {
        result.then(
          (data) => sendResponse({ ok: true, data: data === undefined ? null : data }),
          (err) => sendResponse({ ok: false, error: errorOf(err) }),
        );
        return true; // keep the channel open for the async reply
      }

      sendResponse({ ok: true, data: result });
      return false;
    });
  }

  /** Console logging that is easy to filter and strip later. */
  const log = {
    info: (...args) => console.log(PREFIX, ...args),
    warn: (...args) => console.warn(PREFIX, ...args),
    error: (...args) => console.error(PREFIX, ...args),
  };

  AT.protocol = Object.freeze({
    MESSAGES,
    STORAGE_KEYS,
    api,
    send,
    onMessage,
    errorOf,
    makeError,
    log,
  });
})(globalThis);
