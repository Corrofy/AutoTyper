/**
 * content/content.js — per-frame bootstrap.
 *
 * Runs in every frame (all_frames: true), at document_idle.
 *
 * M0 responsibilities:
 *   - read settings once, then stay in sync through storage.onChanged
 *   - track the frame's last editable element and report it to the background
 *   - mount the floating widget in the top frame only
 *   - wire the widget's enable/collapse/move actions back into settings
 *
 * M2 responsibilities:
 *   - register the textarea/input adapter and create the run state machine
 *   - drive it from the overlay's temporary Start/Stop buttons
 *   - expose a development-only bridge (AT.devTools, from the generated
 *     shared/dev-flags.js) so the fixture probe can seed settings and observe a
 *     real run without a human clicking
 *
 * Deliberately NOT here yet (see plan.md §7): hotkeys (M5), contenteditable and
 * code-editor adapters (M3–M4), diagnostics (M6).
 *
 * Depends on: shared/protocol.js, background/settings.js, engine/*, injection/*,
 *             content/focus-tracker.js, content/overlay/overlay.js
 */

(function (global) {
  "use strict";

  const AT = global.AutoTyper;
  if (
    !AT ||
    !AT.protocol ||
    !AT.settings ||
    !AT.dispatcher ||
    !AT.createTextareaAdapter ||
    !AT.createRunner ||
    !AT.detect
  ) {
    // A silently missing dependency would produce a widget that does nothing.
    console.error("[auto-typer] content bootstrap: dependencies missing");
    return;
  }

  // `chrome.scripting.executeScript` may re-run this file in tabs that were
  // already open when the extension was installed or reloaded. The isolated
  // world is shared across those injections, so a global flag is a reliable guard.
  if (global.__autoTyperBooted) return;
  global.__autoTyperBooted = true;

  const { MESSAGES, send, onMessage, errorOf, log, api } = AT.protocol;
  const settingsApi = AT.settings;

  const isTopFrame = (() => {
    try {
      return global.top === global.self;
    } catch {
      return false;
    }
  })();

  /** @type {ReturnType<typeof AT.settings.defaults>} */
  let settings = settingsApi.defaults();

  let overlay = null;
  let reportTimer = 0;
  let writeChain = Promise.resolve();
  /** Last state reported by the runner; survives between runs for the overlay. */
  let runState = { phase: "idle", reason: "idle", index: 0, total: 0, skipped: 0, adapter: null };

  /** Serialise settings writes so a drag and a collapse cannot interleave. */
  function patch(partial, reason) {
    writeChain = writeChain
      .then(() => send(MESSAGES.SETTINGS_PATCH, partial))
      .then((next) => {
        settings = next;
        render(reason);
      })
      .catch((err) => {
        log.warn(`settings patch failed (${reason})`, err && err.message ? err.message : err);
      });
    return writeChain;
  }

  const tracker = AT.createFocusTracker({
    onChange: () => {
      scheduleReport();
      render("target");
    },
  });

  // ---- injection layer -----------------------------------------------------

  const dispatcher = AT.dispatcher.createDispatcher();
  AT.detect.register(
    AT.createTextareaAdapter({
      dispatcher,
      keycodeMap: AT.keycodeMap,
    }),
  );

  const runner = AT.createRunner({
    getTarget: () => tracker.getTarget(),
    getSettings: () => settings,
    resolveAdapter: (target) => AT.detect.detect(target),
    onState: (state) => {
      runState = state;
      render("run");
    },
    onDone: (state) => {
      log.info("run finished", state.phase, state.reason, `${state.index}/${state.total}`);
      scheduleReport();
    },
  });

  // ---- status --------------------------------------------------------------

  function outcomeText(state) {
    if (!state || state.phase === "typing" || state.phase === "idle") return "";
    switch (state.reason) {
      case "complete":
        return state.skipped ? `Done · ${state.skipped} newline${state.skipped === 1 ? "" : "s"} skipped` : "Done";
      case "no-target":
        return "Click into a text field first";
      case "focus-lost":
        return "Stopped: the field lost focus";
      case "target-removed":
        return "Stopped: the field was removed";
      case "target-disabled":
        return "Stopped: the field became disabled";
      case "unsupported-target":
        return "This field is not supported yet";
      case "page-blocked":
        return "The page blocked the keystroke";
      case "maxlength":
        return "Stopped: the field's maxlength was reached";
      case "no-change":
        return "The field ignored the input";
      case "disabled":
        return "Typing is disabled";
      case "empty-snippet":
        return "Paste a snippet in the popup first";
      case "internal-error":
        return "Stopped after an internal error";
      case "stopped":
      case "dev-stop":
        return "Stopped";
      default:
        return state.phase === "error" ? "Stopped" : "";
    }
  }

  /** Human-readable state for the overlay and the popup. */
  function currentStatus() {
    const target = tracker.getTarget();
    const label = target ? tracker.describe(target) : "";
    const adapter = target ? AT.detect.detect(target) : null;
    const enabled = settings.enabled;
    const snippet = settings.snippet.text || "";
    const active = runner.isActive();
    const finished = runState && runState.phase !== "idle" && runState.phase !== "typing";

    let phase = "disabled";
    if (enabled) {
      if (active) phase = "typing";
      else if (finished) phase = runState.phase; // done | stopped | error
      else phase = target ? (adapter ? "ready" : "error") : "idle";
    }

    let detail = finished ? outcomeText(runState) : "";
    if (!detail && enabled && target && !adapter && snippet) detail = "This field is not supported yet";

    return {
      phase,
      reason: runState ? runState.reason : null,
      target: label,
      total: finished || active ? runState.total || 0 : snippet.length,
      index: finished || active ? runState.index || 0 : 0,
      skipped: runState ? runState.skipped || 0 : 0,
      detail,
      canStart: Boolean(enabled && target && adapter && snippet && !active),
      canStop: active,
    };
  }

  // ---- rendering -----------------------------------------------------------

  function render(reason) {
    if (!overlay) return;
    if (settings.overlay.visible) overlay.mount();
    overlay.update({ settings, status: currentStatus() });
    if (reason && reason !== "run") log.info("render after", reason);
  }

  function snapshotForBackground() {
    const status = currentStatus();
    return {
      phase: status.phase,
      target: status.target,
      hasTarget: Boolean(tracker.getTarget()),
      isTop: isTopFrame,
      total: status.total,
    };
  }

  /** Reports are debounced: focus churn on heavy pages can be very noisy. */
  function scheduleReport() {
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      reportTimer = 0;
      send(MESSAGES.TAB_REPORT, snapshotForBackground()).catch(() => {
        // The background may be restarting; the next report will succeed.
      });
    }, 250);
  }

  // ---- overlay actions -----------------------------------------------------

  function handleOverlayAction(action) {
    switch (action.type) {
      case "toggle-enabled":
        if (!action.value) runner.stop("disabled");
        patch({ enabled: Boolean(action.value) }, "overlay-enabled");
        break;
      case "start":
        runner.start();
        break;
      case "stop":
        runner.stop("stopped");
        break;
      case "collapse":
        patch({ overlay: { collapsed: Boolean(action.value) } }, "overlay-collapse");
        break;
      case "move":
        patch({ overlay: { x: action.x, y: action.y } }, "overlay-move");
        break;
      default:
        log.warn("unknown overlay action", action.type);
    }
  }

  // Only the background owns RUN_*; a content script returning data for those
  // would race the background. Returning `undefined` means "not mine".
  onMessage((message) => {
    if (message.type === MESSAGES.RUN_STATE) return undefined;
    return undefined;
  });

  // ---- development bridge --------------------------------------------------
  //
  // The fixture probe is page script: it cannot read extension storage or reach
  // the isolated world where the runner lives. This bridge exists only when the
  // generated dev-flags script has set `AT.devTools`, which build.mjs adds
  // exclusively with --dev. Production builds have neither the flag nor,
  // therefore, this seam.
  //
  // Transport is a pair of attributes on <html>, observed with
  // MutationObserver. Two event-based drafts failed in Firefox: CustomEvents
  // travelled page→content but not back, and window.postMessage replies never
  // arrived either (the probe could see the bridge marker and a live overlay,
  // yet got zero replies). Attributes are part of the DOM, so both worlds write
  // and read exactly the same bytes; JSON strings keep the boundary trivial.
  //
  // It is intentionally small: ping, patch settings, read state, start, stop.

  const DEV_REQUEST_ATTR = "data-auto-typer-dev-request";
  const DEV_REPLY_ATTR = "data-auto-typer-dev-reply";

  function installDevBridge() {
    // `AT.devTools` comes from the generated shared/dev-flags.js that build.mjs
    // adds only with --dev. A manifest key was the first attempt; Firefox strips
    // unknown top-level properties, so the content world never saw it.
    if (AT.devTools !== true) return;

    async function handle(command, payload) {
      switch (command) {
        case "ping":
          return { version: api.runtime.getManifest().version, top: isTopFrame };
        case "settings.patch":
          settings = await send(MESSAGES.SETTINGS_PATCH, payload || {});
          render("dev-patch");
          return settings;
        case "state":
          return currentStatus();
        case "start":
          return runner.start();
        case "stop":
          return runner.stop("dev-stop");
        default:
          throw new Error(`unknown dev command: ${command}`);
      }
    }

    const root = document.documentElement;
    root.dataset.autoTyperBridge = "installed";

    function reply(id, body) {
      root.setAttribute(DEV_REPLY_ATTR, JSON.stringify({ id, ...body }));
    }

    let lastRequestId = -1;

    function processRequest() {
      const raw = root.getAttribute(DEV_REQUEST_ATTR);
      if (!raw) return;
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      if (!data || typeof data.id !== "number" || typeof data.command !== "string") return;
      if (data.id === lastRequestId) return;
      lastRequestId = data.id;

      handle(data.command, data.payload)
        .then((result) => reply(data.id, { ok: true, data: result ?? null }))
        .catch((err) => reply(data.id, { ok: false, error: errorOf(err) }));
    }

    new MutationObserver(processRequest).observe(root, {
      attributes: true,
      attributeFilter: [DEV_REQUEST_ATTR],
    });
    // The page may have written a request before this script reached
    // document_idle; a late observer would never see that mutation.
    processRequest();

    log.info("dev bridge installed (AT.devTools=true)");
  }

  // ---- boot ----------------------------------------------------------------

  async function boot() {
    try {
      settings = await settingsApi.get();
    } catch (err) {
      log.warn("could not read settings, using defaults", err && err.message ? err.message : err);
    }

    if (isTopFrame) {
      overlay = AT.createOverlay({ onAction: handleOverlayAction });
      if (settings.overlay.visible) overlay.mount();
      overlay.update({ settings, status: currentStatus() });
    }

    settingsApi.onChange((next) => {
      settings = next;
      if (!next.enabled) runner.stop("disabled");
      render("storage");
    });

    // Re-measure the widget if the page changes zoom or the user resizes.
    window.addEventListener("pagehide", () => {
      runner.stop("pagehide");
      tracker.destroy();
      overlay?.destroy();
    });

    installDevBridge();

    /**
     * Boot markers on the widget's host element. Two purposes:
     *   - the automated fixture probe (tools/e2e.mjs) can assert that the whole
     *     overlay → background → storage → render loop closed, not just that a
     *     script parsed;
     *   - a user diagnosing a broken install can inspect one attribute.
     */
    function markBoot(backgroundState) {
      if (!overlay || !overlay.host) return;
      overlay.host.dataset.boot = "ok";
      overlay.host.dataset.bg = backgroundState;
    }

    send(MESSAGES.CONTENT_READY, snapshotForBackground())
      .then(() => markBoot("ok"))
      .catch((err) => {
        log.warn("background unreachable at boot", err && err.message ? err.message : err);
        markBoot("unavailable");
      });

    // If the user installed the extension while this page was open, the first
    // focus may already have happened. Detect it now.
    tracker.refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})(globalThis);
