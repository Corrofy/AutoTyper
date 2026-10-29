/**
 * test/fixture/probe.js — page-side acceptance probe.
 *
 * Included by every fixture page. Does nothing unless the page is loaded with
 * `?probe=1`, which is what tools/e2e.mjs does.
 *
 * It can only observe the page-visible side of the extension (the widget's host
 * element and its open shadow root), which is exactly the surface a user sees.
 * Anything the probe cannot observe is reported as null rather than guessed.
 */

(function () {
  "use strict";

  if (!new URLSearchParams(location.search).has("probe")) return;

  const checks = {
    overlayMounted: false,
    shadowRoot: false,
    panel: false,
    phaseBeforeEnable: null,
    phaseAfterEnable: null,
    speedText: null,
    bootMarker: null,
    backgroundMarker: null,
    focusRetained: false,
    dragMoved: false,
    transformBefore: null,
    transformAfter: null,
    collapsed: null,
    pageErrors: [],
  };

  window.addEventListener("error", (event) => checks.pageErrors.push(String(event.message)));
  window.addEventListener("unhandledrejection", (event) => checks.pageErrors.push(String(event.reason)));

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(predicate, timeoutMs = 10000, intervalMs = 100) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await wait(intervalMs);
    }
    return null;
  }

  /** A pointer gesture spread over real frames, like a human drag. */
  async function dragBy(element, dx, dy) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const options = { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "mouse", isPrimary: true };

    element.dispatchEvent(new PointerEvent("pointerdown", { ...options, clientX: x, clientY: y }));
    await wait(30);
    window.dispatchEvent(new PointerEvent("pointermove", { ...options, clientX: x + dx, clientY: y + dy }));
    await wait(30);
    window.dispatchEvent(new PointerEvent("pointerup", { ...options, clientX: x + dx, clientY: y + dy }));
    await wait(120);
  }

  async function run() {
    const host = await waitFor(() => document.querySelector("[data-auto-typer-host]"));
    checks.overlayMounted = Boolean(host);
    if (!host) return finish();

    const shadow = host.shadowRoot;
    checks.shadowRoot = Boolean(shadow);
    if (!shadow) return finish();

    const panel = shadow.querySelector(".panel");
    checks.panel = Boolean(panel);
    checks.phaseBeforeEnable = shadow.querySelector('[data-el="phase"]')?.textContent ?? null;
    checks.speedText = shadow.querySelector('[data-el="speed"]')?.textContent ?? null;
    // The boot markers are written when the content ↔ background round-trip
    // finishes. Sampling them once raced that round-trip, so wait for it — and
    // still fail if it never arrives.
    checks.bootMarker = await waitFor(() => host.dataset.boot ?? null, 8000);
    checks.backgroundMarker = host.dataset.bg ?? null;

    // ---- 1. clicking the widget must not steal focus from the page ----
    const field = document.querySelector("[data-probe-field]") || document.querySelector("textarea");
    if (field) {
      field.focus();
      await wait(60);
      const before = document.activeElement;
      const head = shadow.querySelector(".head");
      head?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 3,
          pointerType: "mouse",
          isPrimary: true,
          clientX: 10,
          clientY: 10,
        }),
      );
      await wait(80);
      checks.focusRetained = document.activeElement === before && before === field;
      // Release the pointer so the widget does not stay in a drag state.
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 3 }));
      await wait(120);
    }

    // ---- 2. dragging moves the widget ----
    checks.transformBefore = getComputedStyle(host).transform;
    const head = shadow.querySelector(".head");
    if (head) await dragBy(head, 48, 32);
    checks.transformAfter = getComputedStyle(host).transform;
    checks.dragMoved = checks.transformBefore !== checks.transformAfter;

    // ---- 3. enable round-trip: overlay → background → storage → render ----
    const toggle = shadow.querySelector('[data-el="enabled"]');
    if (toggle) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
      const changed = await waitFor(() => {
        const phase = shadow.querySelector('[data-el="phase"]')?.textContent;
        return phase && phase !== "disabled" ? phase : null;
      });
      checks.phaseAfterEnable = changed;
    }

    // ---- 4. collapse round-trip ----
    const collapse = shadow.querySelector('[data-act="collapse"]');
    if (collapse) {
      collapse.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const collapsed = await waitFor(() => panel.dataset.collapsed === "true" || null);
      checks.collapsed = collapsed === true;
    }

    return finish();
  }

  async function finish() {
    try {
      await fetch("/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checks }),
      });
    } catch (err) {
      console.error("probe: could not report", err);
    }
  }

  run().catch((err) => {
    checks.pageErrors.push(`probe crash: ${err && err.message ? err.message : err}`);
    finish();
  });
})();
