/**
 * background/background.js — message router and the only writer of settings.
 *
 * Runs as a service worker in Chromium and as a non-persistent event page in
 * Firefox. Both are terminated when idle, so this file holds NO long-lived state
 * beyond a best-effort cache: anything that must survive goes to storage.
 *
 * Depends on: shared/protocol.js, background/settings.js
 */

(function (global) {
  "use strict";

  // Chromium's classic service worker is a single file, so siblings are pulled in
  // here. Firefox declares all three in manifest.background.scripts instead
  // (importScripts does not exist in a window context, so the guard is exact).
  if (!global.AutoTyper) {
    if (typeof importScripts !== "function") {
      throw new Error("Auto Typer: background loaded without protocol.js and settings.js");
    }
    importScripts("../shared/protocol.js", "settings.js");
  }

  const AT = global.AutoTyper;
  const { MESSAGES, api, onMessage, log } = AT.protocol;
  const settings = AT.settings;

  const BADGE_ON = { text: "ON", color: "#50fa7b", textColor: "#282a36" };
  const BADGE_OFF = { text: "", color: "#44475a", textColor: "#f8f8f2" };

  /**
   * Last report per tab+frame, keyed "tabId:frameId".
   *
   * This is a cache, not a queue: if the worker is terminated the entries are
   * lost, and each content script re-reports on load and whenever its focus
   * target changes. Nothing depends on this being complete.
   */
  const frameReports = new Map();

  const frameKey = (sender) => `${sender.tab.id}:${sender.frameId ?? 0}`;

  function rememberFrame(sender, report) {
    if (!sender.tab) return;
    frameReports.set(frameKey(sender), {
      tabId: sender.tab.id,
      frameId: sender.frameId ?? 0,
      isTop: (sender.frameId ?? 0) === 0,
      url: sender.url || sender.tab.url || "",
      at: Date.now(),
      ...report,
    });
  }

  function forgetTab(tabId) {
    for (const [key, value] of frameReports) {
      if (value.tabId === tabId) frameReports.delete(key);
    }
  }

  // ---- tab status ---------------------------------------------------------

  const INJECTABLE_SCHEME = /^(https?|file):/i;

  /** Pages the browser forbids extensions from touching, with a reason for the UI. */
  function describeRestriction(url) {
    if (!url) return "No page is available yet.";
    if (/^(chrome|edge|brave|opera|about|moz-extension|chrome-extension|view-source):/i.test(url)) {
      return "Browser-internal pages do not allow extensions. Open a normal web page.";
    }
    if (/^https:\/\/chromewebstore\.google\.com\//i.test(url) || /^https:\/\/addons\.mozilla\.org\//i.test(url)) {
      return "Extension stores block injected scripts. Open a normal web page.";
    }
    if (!INJECTABLE_SCHEME.test(url)) return "This page's scheme does not allow content scripts.";
    return null;
  }

  /**
   * Make sure the content scripts exist in this tab. Needed for tabs that were
   * already open when the extension was installed or reloaded, because
   * declarative content scripts only run on navigation.
   */
  async function ensureContent(tabId, url) {
    if (describeRestriction(url)) return false;
    const files = api.runtime.getManifest().content_scripts?.[0]?.js ?? [];
    if (!files.length) return false;
    try {
      await api.scripting.executeScript({ target: { tabId, allFrames: true }, files });
      return true;
    } catch (err) {
      // Common on pages that are still loading or that block execution.
      log.warn("could not inject content scripts", err && err.message ? err.message : err);
      return false;
    }
  }

  async function collectStatus() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { tabId: null, url: "", frames: [], note: "No active tab." };

    const restriction = describeRestriction(tab.url);
    if (!restriction) {
      const known = [...frameReports.values()].some((r) => r.tabId === tab.id);
      if (!known) await ensureContent(tab.id, tab.url);
    }

    const frames = [...frameReports.values()]
      .filter((r) => r.tabId === tab.id)
      .sort((a, b) => Number(b.isTop) - Number(a.isTop) || a.frameId - b.frameId)
      .map(({ at, ...rest }) => rest);

    return {
      tabId: tab.id,
      url: tab.url || "",
      title: tab.title || "",
      blocked: restriction,
      frames,
    };
  }

  // ---- settings writes ----------------------------------------------------

  async function applyPatch(partial) {
    const next = await settings.patch(partial || {});
    await syncBadge(next);
    return next;
  }

  async function syncBadge(maybeSettings) {
    const current = maybeSettings || (await settings.get());
    const look = current.enabled ? BADGE_ON : BADGE_OFF;
    await api.action.setBadgeBackgroundColor({ color: look.color });
    await api.action.setBadgeText({ text: look.text });
    // Present in Chrome 110+ and Firefox 109+; absent elsewhere, hence guarded.
    if (api.action.setBadgeTextColor) {
      await api.action.setBadgeTextColor({ color: look.textColor });
    }
  }

  // ---- router -------------------------------------------------------------

  /**
   * Handlers return plain data or a Promise. Throwing produces the error
   * envelope; nothing here should ever reject a caller silently.
   */
  const handlers = {
    [MESSAGES.SETTINGS_GET]: () => settings.get(),
    [MESSAGES.SETTINGS_PATCH]: (message) => applyPatch(message.payload),
    [MESSAGES.SETTINGS_RESET]: async () => {
      const next = await settings.reset();
      await syncBadge(next);
      return next;
    },
    [MESSAGES.TAB_STATUS_GET]: () => collectStatus(),
    [MESSAGES.CONTENT_READY]: (message, sender) => {
      rememberFrame(sender, { ready: true, ...(message.payload || {}) });
      return { ok: true };
    },
    [MESSAGES.TAB_REPORT]: (message, sender) => {
      rememberFrame(sender, { ready: true, ...(message.payload || {}) });
      return { ok: true };
    },
  };

  onMessage((message, sender) => {
    const handler = handlers[message.type];
    if (!handler) {
      throw Object.assign(new Error(`Unhandled message type: ${message.type}`), { code: "E_NO_HANDLER" });
    }
    return handler(message, sender);
  });

  // ---- lifecycle ----------------------------------------------------------

  api.runtime.onInstalled.addListener(async (details) => {
    log.info("installed", details.reason, "v" + api.runtime.getManifest().version);
    // Seed defaults only on first install so an upgrade never overwrites choices.
    if (details.reason === "install") await settings.reset();
    await syncBadge();
  });

  api.runtime.onStartup.addListener(() => {
    syncBadge();
  });

  settings.onChange((next) => {
    syncBadge(next);
  });

  api.tabs.onRemoved.addListener((tabId) => {
    forgetTab(tabId);
  });

  api.tabs.onUpdated.addListener((tabId, changeInfo) => {
    // A navigation invalidates every frame report for that tab.
    if (changeInfo.status === "loading") forgetTab(tabId);
  });
})(globalThis);
