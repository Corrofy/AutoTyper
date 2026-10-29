/**
 * popup/popup.js — settings UI.
 *
 * Reads storage directly (cheap, always current) and sends every mutation to the
 * background, which owns validation. Keeps its own copy of the last known
 * settings so debounced writes merge instead of clobbering each other.
 *
 * Depends on: shared/protocol.js, background/settings.js
 */

(function () {
  "use strict";

  const AT = globalThis.AutoTyper;
  if (!AT || !AT.protocol || !AT.settings || !AT.cadence) {
    document.body.textContent = "Auto Typer failed to load its scripts. Reload the extension.";
    return;
  }

  const { MESSAGES, send, api, log } = AT.protocol;
  const settingsApi = AT.settings;

  const $ = (id) => document.getElementById(id);

  const ui = {
    enabled: $("enabled"),
    version: $("version"),
    snippetText: $("snippetText"),
    charCount: $("charCount"),
    fileName: $("fileName"),
    importBtn: $("importBtn"),
    clearBtn: $("clearBtn"),
    fileInput: $("fileInput"),
    wpm: $("wpm"),
    wpmBadge: $("wpmBadge"),
    cps: $("cps"),
    msPerChar: $("msPerChar"),
    duration: $("duration"),
    modeButtons: [...document.querySelectorAll("[data-mode]")],
    replaceWarn: $("replaceWarn"),
    jitter: $("jitter"),
    mistakes: $("mistakes"),
    pauseOnBlur: $("pauseOnBlur"),
    tabStatus: $("tabStatus"),
    refreshTab: $("refreshTab"),
    saveState: $("saveState"),
    resetBtn: $("resetBtn"),
  };

  /** Last known validated settings. Debounced patches merge onto this. */
  let current = settingsApi.defaults();
  let pending = {};
  let pendingTimer = 0;
  let resetArmed = false;
  let resetTimer = 0;
  let tabTimer = 0;

  // ---- rendering ----------------------------------------------------------

  function formatDuration(chars, wpm) {
    if (!chars) return "—";
    const seconds = Math.round((chars / (wpm * 5)) * 60);
    if (seconds < 60) return `≈ ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `≈ ${minutes}m ${String(rest).padStart(2, "0")}s`;
  }

  function renderSpeed(wpm, chars) {
    ui.wpm.value = String(wpm);
    ui.wpmBadge.textContent = `${wpm} WPM`;
    ui.cps.textContent = `${AT.cadence.wpmToCps(wpm).toFixed(2)} cps`;
    ui.msPerChar.textContent = `${Math.round(AT.cadence.wpmToMeanMs(wpm))} ms/char`;
    ui.duration.textContent = formatDuration(chars, wpm);
  }

  function renderSnippetMeta(settings) {
    const chars = (settings.snippet.text || "").length;
    ui.charCount.textContent = `${chars.toLocaleString()} chars`;
    ui.fileName.textContent = settings.snippet.filename || "no file";
    ui.fileName.title = settings.snippet.filename || "";
    renderSpeed(settings.speed.wpm, chars);
  }

  function renderMode(settings) {
    for (const button of ui.modeButtons) {
      button.setAttribute("aria-checked", String(button.dataset.mode === settings.mode));
    }
    ui.replaceWarn.hidden = settings.mode !== "replace";
  }

  function render(settings, { skipSnippet = false } = {}) {
    ui.enabled.checked = settings.enabled;
    ui.jitter.checked = settings.jitter.enabled;
    ui.mistakes.checked = settings.mistakes.enabled;
    ui.pauseOnBlur.checked = settings.behavior.pauseOnBlur;

    if (!skipSnippet) ui.snippetText.value = settings.snippet.text || "";
    renderSnippetMeta(settings);
    renderMode(settings);
  }

  function setSaveState(text, isError = false) {
    ui.saveState.textContent = text;
    ui.saveState.dataset.error = String(isError);
  }

  // ---- writing ------------------------------------------------------------

  function merge(base, patch) {
    const out = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      out[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(base[key] || {}, value) : value;
    }
    return out;
  }

  async function flush() {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = 0;
    }
    const patch = pending;
    pending = {};
    if (!Object.keys(patch).length) return;

    setSaveState("Saving…");
    try {
      current = await send(MESSAGES.SETTINGS_PATCH, patch);
      render(current, { skipSnippet: document.activeElement === ui.snippetText });
      setSaveState("Saved");
    } catch (err) {
      log.warn("save failed", err);
      setSaveState(err && err.message ? err.message : "Save failed", true);
    }
  }

  /** Queue a patch; `immediate` skips the debounce for checkbox/segment clicks. */
  function queue(patch, { immediate = false } = {}) {
    current = merge(current, patch);
    pending = merge(pending, patch);
    if (immediate) {
      flush();
      return;
    }
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flush, 220);
  }

  // ---- tab status ---------------------------------------------------------

  function describeFrames(status) {
    if (!status || !status.tabId) return { text: "No active tab.", state: "warn" };
    if (status.blocked) return { text: status.blocked, state: "warn" };

    const frames = status.frames || [];
    if (!frames.length) {
      return {
        text: "No Auto Typer frame here yet. Reload the page once after installing.",
        state: "warn",
      };
    }

    const withTarget = frames.find((f) => f.hasTarget);
    if (withTarget) {
      return { text: `Target: ${withTarget.target || "field"}`, state: "ok" };
    }

    const top = frames.find((f) => f.isTop) || frames[0];
    const where = top.isTop ? "page" : "frame";
    return {
      text: `Active on this ${where}. Click into a text field, then use the hotkey.`,
      state: "idle",
    };
  }

  async function refreshTab({ retry = true } = {}) {
    try {
      const status = await send(MESSAGES.TAB_STATUS_GET);
      const { text, state } = describeFrames(status);
      ui.tabStatus.textContent = text;
      ui.tabStatus.dataset.state = state;

      // A tab opened before install gets injected on demand; give it a moment.
      if (retry && status && !status.blocked && !(status.frames || []).length) {
        if (tabTimer) clearTimeout(tabTimer);
        tabTimer = setTimeout(() => refreshTab({ retry: false }), 600);
      }
    } catch (err) {
      ui.tabStatus.textContent = err && err.message ? err.message : "Could not reach the background.";
      ui.tabStatus.dataset.state = "warn";
    }
  }

  // ---- events -------------------------------------------------------------

  ui.enabled.addEventListener("change", () => {
    queue({ enabled: ui.enabled.checked }, { immediate: true });
  });

  ui.snippetText.addEventListener("input", () => {
    const text = ui.snippetText.value;
    ui.charCount.textContent = `${text.length.toLocaleString()} chars`;
    renderSpeed(current.speed.wpm, text.length);
    queue({ snippet: { text } });
  });

  ui.clearBtn.addEventListener("click", () => {
    ui.snippetText.value = "";
    renderSpeed(current.speed.wpm, 0);
    queue({ snippet: { text: "", filename: null } }, { immediate: true });
  });

  ui.importBtn.addEventListener("click", () => ui.fileInput.click());

  ui.fileInput.addEventListener("change", async () => {
    const file = ui.fileInput.files && ui.fileInput.files[0];
    if (!file) return;
    const limit = settingsApi.LIMITS.snippetChars;
    try {
      const raw = await file.text();
      if (raw.length > limit) {
        setSaveState(`File is ${raw.length.toLocaleString()} chars; limit is ${limit.toLocaleString()}.`, true);
        return;
      }
      // Normalise line endings so the engine sees predictable newlines.
      const normalized = raw.replace(/\r\n?/g, "\n");
      ui.snippetText.value = normalized;
      renderSpeed(current.speed.wpm, normalized.length);
      ui.charCount.textContent = `${normalized.length.toLocaleString()} chars`;
      ui.fileName.textContent = file.name;
      queue({ snippet: { text: normalized, filename: file.name } }, { immediate: true });
    } catch (err) {
      setSaveState(`Could not read file: ${err && err.message ? err.message : err}`, true);
    } finally {
      ui.fileInput.value = "";
    }
  });

  ui.wpm.addEventListener("input", () => {
    const wpm = Number(ui.wpm.value);
    renderSpeed(wpm, ui.snippetText.value.length);
    queue({ speed: { wpm } });
  });
  ui.wpm.addEventListener("change", flush);

  for (const button of ui.modeButtons) {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      renderMode({ mode });
      queue({ mode }, { immediate: true });
    });
  }

  ui.jitter.addEventListener("change", () => queue({ jitter: { enabled: ui.jitter.checked } }, { immediate: true }));
  ui.mistakes.addEventListener("change", () => queue({ mistakes: { enabled: ui.mistakes.checked } }, { immediate: true }));
  ui.pauseOnBlur.addEventListener("change", () =>
    queue({ behavior: { pauseOnBlur: ui.pauseOnBlur.checked } }, { immediate: true }),
  );

  ui.refreshTab.addEventListener("click", () => refreshTab());

  ui.resetBtn.addEventListener("click", async () => {
    if (!resetArmed) {
      resetArmed = true;
      ui.resetBtn.textContent = "Confirm reset";
      resetTimer = setTimeout(() => {
        resetArmed = false;
        ui.resetBtn.textContent = "Reset settings";
      }, 4000);
      return;
    }
    clearTimeout(resetTimer);
    resetArmed = false;
    ui.resetBtn.textContent = "Reset settings";
    try {
      current = await send(MESSAGES.SETTINGS_RESET);
      render(current);
      setSaveState("Reset to defaults");
    } catch (err) {
      setSaveState(err && err.message ? err.message : "Reset failed", true);
    }
  });

  // Keep the popup in sync when the overlay (or another popup) changes settings.
  settingsApi.onChange((next) => {
    current = next;
    render(next, { skipSnippet: document.activeElement === ui.snippetText });
    setSaveState("Synced");
  });

  // ---- boot ---------------------------------------------------------------

  (async function boot() {
    ui.version.textContent = `v${api.runtime.getManifest().version}`;
    try {
      current = await settingsApi.get();
      render(current);
      setSaveState("Loaded");
    } catch (err) {
      setSaveState(err && err.message ? err.message : "Could not load settings", true);
    }
    refreshTab();
  })();
})();
