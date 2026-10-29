/**
 * test/fixture/typing-probe.js — M2 acceptance probe.
 *
 * Page script. It can see what the page sees (values, events, React's tracker)
 * but not the extension's isolated world, so it talks to the dev-only bridge in
 * content/content.js with window.postMessage. The bridge is installed only when
 * the generated dev-flags script (added by `node build.mjs --dev`) has set
 * `AT.devTools`; production builds have no seam.
 *
 * Runs, all at 50 WPM with jitter and thinking pauses disabled so the wall-clock
 * budget stays around 20 seconds:
 *
 *   1. plain textarea, started from the overlay button (the human path)
 *   2. React-style controlled textarea, started through the bridge
 *   3. single-line input with a newline in the snippet (must be skipped)
 *   4. a mistakes-enabled run (at least one real correction, exact final text)
 *   5. stop mid-run (prefix only, terminal phase reported)
 *
 * Every run also feeds three event-fidelity checks:
 *   - order: keydown → (keypress) → (beforeinput) → input → keyup
 *   - legacy: keydown/keyup report charCode 0; keypress reports charCode/which
 *   - untrusted: every keystroke the page received was synthetic (isTrusted false)
 */

(function () {
  "use strict";

  if (!new URLSearchParams(location.search).has("probe")) return;

  const REQUEST_ATTR = "data-auto-typer-dev-request";
  const REPLY_ATTR = "data-auto-typer-dev-reply";

  const checks = {
    probe: "typing",
    bridgeReady: false,
    bridgeMarker: null,
    overlayMounted: false,
    overlayStartEnabled: false,
    runs: {},
    order: { checked: 0, failures: [] },
    legacy: { checked: 0, failures: [] },
    untrusted: { checked: 0, failures: [] },
    pageErrors: [],
  };

  window.addEventListener("error", (event) => checks.pageErrors.push(String(event.message)));
  window.addEventListener("unhandledrejection", (event) => checks.pageErrors.push(String(event.reason)));

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(predicate, timeoutMs = 8000, intervalMs = 80) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let value = null;
      try {
        value = await predicate();
      } catch {
        value = null;
      }
      if (value) return value;
      await wait(intervalMs);
    }
    return null;
  }

  // ---- bridge -------------------------------------------------------------

  let serial = 0;
  const pending = new Map();

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.channel !== CHANNEL || message.direction !== "reply") return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.ok) waiter.resolve(message.data);
    else waiter.reject(new Error((message.error && message.error.message) || "bridge error"));
  });

  function bridge(command, payload) {
    const id = (serial += 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`bridge timeout: ${command}`));
      }, 12000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      window.postMessage({ channel: CHANNEL, direction: "request", id, command, payload }, "*");
    });
  }

  // ---- event recorder -----------------------------------------------------

  const FIELDS = new Set(["plain", "controlled", "single"]);
  const KEY_TYPES = ["keydown", "keypress", "beforeinput", "input", "keyup"];
  const allEvents = [];
  let recording = false;
  let captureStart = 0;

  for (const type of KEY_TYPES) {
    document.addEventListener(
      type,
      (event) => {
        if (!recording) return;
        const target = event.target;
        if (!target || !FIELDS.has(target.id)) return;
        allEvents.push({
          type,
          target: target.id,
          key: typeof event.key === "string" ? event.key : null,
          keyCode: Number(event.keyCode) || 0,
          which: Number(event.which) || 0,
          charCode: Number(event.charCode) || 0,
          inputType: typeof event.inputType === "string" ? event.inputType : null,
          data: typeof event.data === "string" ? event.data : null,
          isTrusted: event.isTrusted,
        });
      },
      true,
    );
  }

  function beginCapture() {
    captureStart = allEvents.length;
    recording = true;
  }

  function endCapture() {
    recording = false;
    return allEvents.slice(captureStart);
  }

  /**
   * One character is one cycle. A printable character adds keypress; a deletion
   * has no keypress. `beforeinput` is optional because execCommand may edit
   * without announcing it, which is exactly why the check is not stricter.
   */
  function checkOrder(capture, targetId) {
    const sequence = capture.filter((event) => event.target === targetId).map((event) => event.type);
    const failures = [];
    let index = 0;
    let cycles = 0;

    while (index < sequence.length) {
      const start = index;
      if (sequence[index] !== "keydown") {
        failures.push(`cycle ${cycles} starts with ${sequence[index]} at ${start}`);
        break;
      }
      index += 1;
      if (sequence[index] === "keypress") index += 1;
      if (sequence[index] === "beforeinput") index += 1;
      if (sequence[index] !== "input") {
        failures.push(`cycle ${cycles} has no input: [${sequence.slice(start, start + 5).join(", ")}]`);
        break;
      }
      index += 1;
      if (sequence[index] !== "keyup") {
        failures.push(`cycle ${cycles} has no keyup: [${sequence.slice(start, start + 6).join(", ")}]`);
        break;
      }
      index += 1;
      cycles += 1;
    }

    return { ok: failures.length === 0 && cycles > 0, cycles, failures };
  }

  function collectMove(container, move, label) {
    if (!move) return;
    container.checked += move.cycles;
    for (const failure of move.failures) container.failures.push(`${label}: ${failure}`);
  }

  // ---- field helpers ------------------------------------------------------

  const plain = document.getElementById("plain");
  const controlled = document.getElementById("controlled");
  const single = document.getElementById("single");
  const status = document.getElementById("status");

  function resetField(element) {
    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function focusField(element) {
    const label = element.getAttribute("aria-label");
    element.focus();
    const target = await waitFor(async () => {
      const state = await bridge("state");
      return state.target && state.target.includes(label) ? state : null;
    }, 5000);
    if (!target) throw new Error(`focus tracker never picked up #${element.id}`);
    return target;
  }

  async function configure(overrides) {
    await bridge("settings.patch", {
      enabled: true,
      overlay: { visible: true, collapsed: false },
      jitter: { enabled: false },
      pauses: { word: false, symbol: false, newline: false, burstChance: 0 },
      mistakes: { enabled: false },
      ...overrides,
    });
  }

  async function waitForTerminal(timeoutMs = 30000) {
    const state = await waitFor(async () => {
      const current = await bridge("state");
      return current.phase === "done" || current.phase === "stopped" || current.phase === "error"
        ? current
        : null;
    }, timeoutMs);
    if (!state) throw new Error("run never reached a terminal phase");
    return state;
  }

  async function startRun() {
    const started = await bridge("start");
    if (!started || started.started !== true) {
      throw new Error(`run refused to start: ${JSON.stringify(started)}`);
    }
    return waitForTerminal();
  }

  function reportText(text) {
    if (status) status.textContent = text;
  }

  // ---- the runs -----------------------------------------------------------

  async function run() {
    checks.bridgeMarker = document.documentElement.dataset.autoTyperBridge || null;
    checks.overlayMounted = Boolean(document.querySelector("[data-auto-typer-host]"));

    const ping = await waitFor(() => bridge("ping").catch(() => null), 10000, 200);
    if (!ping) {
      // Re-sample after the wait: the first sample runs before document_idle.
      checks.bridgeMarker = document.documentElement.dataset.autoTyperBridge || null;
      checks.overlayMounted = Boolean(document.querySelector("[data-auto-typer-host]"));
      throw new Error("dev bridge never answered ping");
    }
    checks.bridgeReady = true;

    const host = await waitFor(() => document.querySelector("[data-auto-typer-host]"));
    if (!host) throw new Error("overlay host missing");
    const shadow = host.shadowRoot;
    if (!shadow) throw new Error("overlay shadow root missing");

    // ---- 1. plain textarea, started from the overlay --------------------
    await configure({ snippet: { text: "hello world", filename: null } });
    resetField(plain);
    await focusField(plain);

    const startButton = await waitFor(() => {
      const button = shadow.querySelector('[data-el="start"]');
      return button && button.disabled === false ? button : null;
    }, 8000);
    checks.overlayStartEnabled = Boolean(startButton);
    if (!startButton) throw new Error("overlay Start never became enabled");

    beginCapture();
    startButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
    const plainFinal = await waitForTerminal();
    const plainCapture = endCapture();
    collectMove(checks.order, checkOrder(plainCapture, "plain"), "plain");
    checks.runs.plain = {
      value: plain.value,
      phase: plainFinal.phase,
      reason: plainFinal.reason,
      detail: plainFinal.detail,
      index: plainFinal.index,
      total: plainFinal.total,
    };
    reportText(`plain: ${JSON.stringify(plain.value)} (${plainFinal.phase})`);

    // ---- 2. React-style controlled textarea -----------------------------
    await configure({ snippet: { text: "react", filename: null } });
    window.__controlledChanges = 0;
    resetField(controlled);
    await focusField(controlled);

    beginCapture();
    const controlledFinal = await startRun();
    const controlledCapture = endCapture();
    collectMove(checks.order, checkOrder(controlledCapture, "controlled"), "controlled");
    checks.runs.controlled = {
      value: controlled.value,
      onChange: window.__controlledChanges,
      phase: controlledFinal.phase,
      reason: controlledFinal.reason,
    };
    reportText(`controlled: ${JSON.stringify(controlled.value)} · onChange ${window.__controlledChanges}`);

    // ---- 3. single-line input skips the newline -------------------------
    await configure({ snippet: { text: "one\ntwo", filename: null } });
    resetField(single);
    await focusField(single);

    beginCapture();
    const singleFinal = await startRun();
    const singleCapture = endCapture();
    collectMove(checks.order, checkOrder(singleCapture, "single"), "single");
    checks.runs.single = {
      value: single.value,
      phase: singleFinal.phase,
      reason: singleFinal.reason,
      total: singleFinal.total,
      skipped: singleFinal.skipped,
    };
    reportText(`single: ${JSON.stringify(single.value)} · skipped ${singleFinal.skipped}`);

    // ---- 4. mistakes: real corrections, exact final text ----------------
    // Rate is capped at 0.2, so a short run may legitimately draw no slip at
    // all. Retry a couple of times and report how many attempts it took; the
    // invariant under test is the final text, not the dice.
    checks.runs.mistakes = { attempts: 0, corrections: 0, value: null, phase: null };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await configure({
        snippet: { text: "brown fox jumps", filename: null },
        mistakes: { enabled: true, rate: 0.2, minPauseMs: 30, maxPauseMs: 60 },
      });
      resetField(plain);
      await focusField(plain);

      beginCapture();
      const fresh = await startRun();
      const capture = endCapture();
      const corrections = capture.filter(
        (event) => event.type === "keydown" && event.keyCode === 8,
      ).length;

      checks.runs.mistakes = {
        attempts: attempt,
        corrections,
        value: plain.value,
        phase: fresh.phase,
        reason: fresh.reason,
      };
      if (corrections > 0) break;
    }
    reportText(`mistakes: ${JSON.stringify(plain.value)} · ${checks.runs.mistakes.corrections} backspace(s)`);

    // ---- 5. stop mid-run ------------------------------------------------
    const stopSnippet = "stop me now please";
    await configure({ snippet: { text: stopSnippet, filename: null } });
    resetField(plain);
    await focusField(plain);

    await bridge("start");
    await wait(900);
    await bridge("stop");
    const stoppedFinal = await waitForTerminal(6000);
    checks.runs.stop = {
      phase: stoppedFinal.phase,
      reason: stoppedFinal.reason,
      value: plain.value,
      typed: plain.value.length,
      prefixOfSnippet: stopSnippet.startsWith(plain.value),
    };
    reportText(`stop: ${JSON.stringify(plain.value)} (${stoppedFinal.phase})`);

    // ---- event fidelity across every run --------------------------------
    for (const event of allEvents) {
      if (event.type === "keydown" || event.type === "keyup") {
        checks.legacy.checked += 1;
        if (event.charCode !== 0) {
          checks.legacy.failures.push(`${event.type} ${event.key}: charCode ${event.charCode}, expected 0`);
        }
        if (event.which !== event.keyCode) {
          checks.legacy.failures.push(`${event.type} ${event.key}: which ${event.which} !== keyCode ${event.keyCode}`);
        }
      } else if (event.type === "keypress") {
        checks.legacy.checked += 1;
        if (!(event.charCode > 0)) {
          checks.legacy.failures.push(`keypress ${event.key}: charCode ${event.charCode}, expected > 0`);
        }
        if (event.which !== event.charCode) {
          checks.legacy.failures.push(`keypress ${event.key}: which ${event.which} !== charCode ${event.charCode}`);
        }
      }

      // Only the keystrokes are ours. An `input` event produced by
      // execCommand comes from the browser's editing pipeline and may be
      // trusted; that is the pipeline doing its job, not us faking the user.
      if (event.type === "keydown" || event.type === "keypress" || event.type === "keyup") {
        checks.untrusted.checked += 1;
        if (event.isTrusted !== false) {
          checks.untrusted.failures.push(`${event.type} ${event.key} was trusted`);
        }
      }
    }
  }

  async function finish() {
    try {
      await fetch("/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checks }),
      });
    } catch (err) {
      console.error("typing probe: could not report", err);
    }
  }

  run()
    .catch((err) => {
      checks.pageErrors.push(`probe crash: ${err && err.message ? err.message : err}`);
      reportText(`probe failed: ${err && err.message ? err.message : err}`);
    })
    .then(finish);
})();
