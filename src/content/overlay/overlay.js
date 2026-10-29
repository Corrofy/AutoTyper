/**
 * content/overlay/overlay.js — the floating widget.
 *
 * Design constraints that shaped this file:
 *
 * 1. Shadow DOM. The widget lives on arbitrary websites, some of which style
 *    every div and button aggressively. A shadow root plus `:host { all: initial }`
 *    keeps the widget's appearance independent of the page (and the page's
 *    appearance independent of us).
 *
 * 2. It must never steal focus. `pointerdown` is cancelled, so clicking the
 *    widget does not blur the editor the user just clicked into. This is the
 *    whole reason the focus tracker can remember a target across UI clicks.
 *
 * 3. It is rendered in the top frame only. Inside an iframe it would be clipped
 *    and could not be dragged across the viewport.
 *
 * 4. Position is global (one place on screen, all sites), persisted through the
 *    background so validation lives in one place.
 *
 * Depends on: shared/protocol.js
 */

(function (global) {
  "use strict";

  const AT = global.AutoTyper;
  if (!AT || !AT.protocol) throw new Error("Auto Typer: overlay.js loaded before protocol.js");

  const HOST_ATTR = "data-auto-typer-host";
  const MARGIN = 8;

  const STYLE = /* css */ `
    :host {
      all: initial;
      position: fixed;
      left: 0;
      top: 0;
      z-index: 2147483647;
      display: block;
      contain: layout style;
      color-scheme: dark;

      --at-bg: #282a36;
      --at-bg-2: #21222c;
      --at-line: #44475a;
      --at-fg: #f8f8f2;
      --at-muted: #8a92c0;
      --at-purple: #bd93f9;
      --at-green: #50fa7b;
      --at-cyan: #8be9fd;
      --at-yellow: #f1fa8c;
      --at-red: #ff5555;
    }

    * { box-sizing: border-box; }

    .panel {
      width: 272px;
      background: var(--at-bg);
      color: var(--at-fg);
      border: 1px solid var(--at-line);
      border-radius: 10px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
      font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      user-select: none;
    }
    .panel[data-collapsed="true"] { width: auto; }

    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 8px 7px 10px;
      background: var(--at-bg-2);
      border-bottom: 1px solid var(--at-line);
      cursor: grab;
      touch-action: none;
    }
    .head:active { cursor: grabbing; }

    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--at-muted);
      box-shadow: 0 0 0 3px rgba(138, 146, 192, 0.15);
      flex: 0 0 auto;
    }
    .dot[data-phase="ready"] { background: var(--at-green); box-shadow: 0 0 0 3px rgba(80, 250, 123, 0.18); }
    .dot[data-phase="typing"] { background: var(--at-cyan); box-shadow: 0 0 0 3px rgba(139, 233, 253, 0.2); }
    .dot[data-phase="done"] { background: var(--at-green); box-shadow: 0 0 0 3px rgba(80, 250, 123, 0.18); }
    .dot[data-phase="paused"] { background: var(--at-yellow); box-shadow: 0 0 0 3px rgba(241, 250, 140, 0.18); }
    .dot[data-phase="stopped"] { background: var(--at-yellow); box-shadow: 0 0 0 3px rgba(241, 250, 140, 0.18); }
    .dot[data-phase="error"] { background: var(--at-red); box-shadow: 0 0 0 3px rgba(255, 85, 85, 0.18); }

    .title {
      font-weight: 650;
      font-size: 12px;
      letter-spacing: 0.01em;
      flex: 1 1 auto;
      white-space: nowrap;
    }

    button {
      font: inherit;
      color: var(--at-fg);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      padding: 2px 6px;
      line-height: 1.2;
    }
    button:hover { background: rgba(189, 147, 249, 0.16); border-color: var(--at-line); }
    button:focus-visible { outline: 2px solid var(--at-purple); outline-offset: 1px; }

    .body {
      padding: 9px 10px 10px;
      display: grid;
      gap: 7px;
    }
    .panel[data-collapsed="true"] .body { display: none; }

    .statusline {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .phase {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--at-muted);
    }
    .count { font-variant-numeric: tabular-nums; font-size: 11px; color: var(--at-muted); }

    .target {
      font-size: 11.5px;
      color: var(--at-cyan);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .target[data-empty="true"] { color: var(--at-muted); }

    .meter {
      height: 4px;
      border-radius: 999px;
      background: var(--at-line);
      overflow: hidden;
    }
    .meter-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, var(--at-purple), var(--at-cyan));
      transition: width 120ms linear;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .speed { font-variant-numeric: tabular-nums; color: var(--at-fg); font-size: 11.5px; }
    .hint { color: var(--at-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }

    /* M2's temporary run controls. M5 replaces them with the hotkey UI. */
    .controls { display: flex; gap: 6px; }
    .controls button {
      flex: 1 1 0;
      border-color: var(--at-line);
      padding: 3px 8px;
      font-weight: 600;
      font-size: 11.5px;
    }
    .controls button[data-act="start"]:not(:disabled) {
      color: var(--at-green);
      border-color: rgba(80, 250, 123, 0.4);
    }
    .controls button[data-act="stop"]:not(:disabled) {
      color: var(--at-red);
      border-color: rgba(255, 85, 85, 0.4);
    }
    .controls button:disabled { opacity: 0.38; cursor: default; }
    .note {
      font-size: 10.5px;
      color: var(--at-yellow);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .note[hidden] { display: none; }

    .switch { position: relative; display: inline-flex; width: 32px; height: 18px; flex: 0 0 auto; }
    .switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
    .switch .track {
      position: absolute; inset: 0;
      border-radius: 999px;
      background: var(--at-line);
      transition: background 140ms ease;
    }
    .switch .track::after {
      content: "";
      position: absolute;
      top: 2px; left: 2px;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: var(--at-fg);
      transition: transform 140ms ease;
    }
    .switch input:checked + .track { background: var(--at-green); }
    .switch input:checked + .track::after { transform: translateX(14px); background: #21222c; }
    .switch input:focus-visible + .track { outline: 2px solid var(--at-purple); outline-offset: 2px; }

    @media (prefers-reduced-motion: reduce) {
      .meter-fill, .switch .track, .switch .track::after { transition: none; }
    }
  `;

  const TEMPLATE = /* html */ `
    <div class="panel" data-collapsed="false" role="region" aria-label="Auto Typer">
      <header class="head" part="head">
        <span class="dot" data-phase="disabled" aria-hidden="true"></span>
        <span class="title">Auto Typer</span>
        <button type="button" data-act="collapse" aria-expanded="true" title="Collapse">▾</button>
      </header>
      <div class="body">
        <div class="statusline">
          <span class="phase" data-el="phase">disabled</span>
          <span class="count" data-el="count">0 / 0</span>
        </div>
        <div class="target" data-el="target" data-empty="true">No field focused</div>
        <div class="meter"><div class="meter-fill" data-el="fill"></div></div>
        <div class="controls">
          <button type="button" data-act="start" data-el="start" disabled>Start</button>
          <button type="button" data-act="stop" data-el="stop" disabled>Stop</button>
        </div>
        <div class="note" data-el="note" hidden></div>
        <div class="row">
          <span class="speed" data-el="speed">40 WPM</span>
          <span class="hint" data-el="hint">Alt+Shift+Space</span>
        </div>
        <div class="row">
          <span class="phase">Enabled</span>
          <label class="switch" title="Enable or disable Auto Typer">
            <input type="checkbox" data-el="enabled" />
            <span class="track"></span>
          </label>
        </div>
      </div>
    </div>
  `;

  function clampPosition(x, y, width, height) {
    const maxX = Math.max(MARGIN, global.innerWidth - width - MARGIN);
    const maxY = Math.max(MARGIN, global.innerHeight - height - MARGIN);
    return {
      x: Math.round(Math.min(maxX, Math.max(MARGIN, x))),
      y: Math.round(Math.min(maxY, Math.max(MARGIN, y))),
    };
  }

  /**
   * @param {object} options
   * @param {(action: {type: string, [key: string]: any}) => void} options.onAction
   */
  AT.createOverlay = function createOverlay({ onAction }) {
    const existing = document.querySelector(`[${HOST_ATTR}]`);
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "");
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.append(style);

    const wrapper = document.createElement("div");
    // DOMParser instead of innerHTML: the markup is a compile-time constant, but
    // avoiding innerHTML keeps the add-on lint clean and removes an escaping
    // hazard if this template ever gains interpolated content.
    const parsed = new DOMParser().parseFromString(TEMPLATE.trim(), "text/html");
    wrapper.append(document.adoptNode(parsed.body.firstElementChild));
    shadow.append(wrapper.firstElementChild);

    const panel = shadow.querySelector(".panel");
    const head = shadow.querySelector(".head");
    const dot = shadow.querySelector(".dot");
    const refs = {};
    for (const node of shadow.querySelectorAll("[data-el]")) refs[node.dataset.el] = node;

    let position = { x: MARGIN, y: MARGIN };
    let mounted = false;
    let dragging = false;

    function applyPosition() {
      const rect = panel.getBoundingClientRect();
      const size = { width: rect.width || 272, height: rect.height || 120 };
      position = clampPosition(position.x, position.y, size.width, size.height);
      host.style.transform = `translate(${position.x}px, ${position.y}px)`;
    }

    // ---- dragging ---------------------------------------------------------

    let dragOrigin = null;

    function onPointerDown(event) {
      // Never steal focus from the editor.
      event.preventDefault();
      if (event.target.closest("button, input, label")) return;
      dragging = true;
      dragOrigin = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        startX: position.x,
        startY: position.y,
        pointerId: event.pointerId,
      };
      // Synthetic events (tests) carry pointer ids the browser does not know, and
      // setPointerCapture throws for those. Dragging must not depend on capture.
      try {
        head.setPointerCapture?.(event.pointerId);
      } catch {
        /* no capture available — window listeners still drive the drag */
      }
      global.addEventListener("pointermove", onPointerMove, true);
      global.addEventListener("pointerup", onPointerUp, true);
      global.addEventListener("pointercancel", onPointerUp, true);
    }

    function onPointerMove(event) {
      if (!dragging || !dragOrigin) return;
      position = {
        x: dragOrigin.startX + (event.clientX - dragOrigin.pointerX),
        y: dragOrigin.startY + (event.clientY - dragOrigin.pointerY),
      };
      // Live clamp keeps the widget reachable while dragging.
      const rect = panel.getBoundingClientRect();
      position = clampPosition(position.x, position.y, rect.width, rect.height);
      host.style.transform = `translate(${position.x}px, ${position.y}px)`;
    }

    function onPointerUp(event) {
      if (!dragging) return;
      dragging = false;
      if (dragOrigin) {
        try {
          if (head.hasPointerCapture?.(dragOrigin.pointerId)) head.releasePointerCapture(dragOrigin.pointerId);
        } catch {
          /* see onPointerDown */
        }
      }
      dragOrigin = null;
      global.removeEventListener("pointermove", onPointerMove, true);
      global.removeEventListener("pointerup", onPointerUp, true);
      global.removeEventListener("pointercancel", onPointerUp, true);
      applyPosition();
      onAction?.({ type: "move", x: position.x, y: position.y });
    }

    // ---- interactions -----------------------------------------------------

    function onClick(event) {
      const button = event.target.closest("button[data-act]");
      if (!button || button.disabled) return;
      event.preventDefault();
      const act = button.dataset.act;
      if (act === "collapse") {
        const next = panel.dataset.collapsed !== "true";
        onAction?.({ type: "collapse", value: next });
      } else if (act === "start" || act === "stop") {
        onAction?.({ type: act });
      }
    }

    /**
     * Buttons take focus on pointerdown, which would blur the editor and make the
     * run's focus check fail before the first character. Cancelling the default
     * on buttons only keeps their click action while leaving the checkbox's
     * native behaviour untouched.
     */
    function onButtonPointerDown(event) {
      if (event.target.closest("button")) event.preventDefault();
    }

    function onToggle(event) {
      if (event.target.dataset.el === "enabled") {
        onAction?.({ type: "toggle-enabled", value: event.target.checked });
      }
    }

    head.addEventListener("pointerdown", onPointerDown);
    shadow.addEventListener("pointerdown", onButtonPointerDown);
    shadow.addEventListener("click", onClick);
    shadow.addEventListener("change", onToggle);

    function onResize() {
      applyPosition();
    }
    global.addEventListener("resize", onResize);

    // ---- public API -------------------------------------------------------

    function mount() {
      if (mounted) return;
      document.documentElement.appendChild(host);
      mounted = true;
      applyPosition();
    }

    /**
     * Idempotent render. Only text and attributes are updated, so an in-progress
     * drag or a focused switch is never destroyed by a state refresh.
     */
    function update({ settings, status } = {}) {
      if (settings) {
        const { wpm } = settings.speed;
        // One source of truth for the speed arithmetic (M1 follow-up): cadence.js
        // is loaded in every context that renders these numbers.
        const cps = AT.cadence ? AT.cadence.wpmToCps(wpm) : wpm / 12;
        const ms = AT.cadence ? Math.round(AT.cadence.wpmToMeanMs(wpm)) : Math.round(60000 / (wpm * 5));
        refs.speed.textContent = `${wpm} WPM · ${cps.toFixed(2)} cps`;
        refs.speed.title = `${ms} ms per character`;
        refs.hint.textContent = settings.hotkeys.startStop;

        panel.dataset.collapsed = settings.overlay.collapsed ? "true" : "false";
        shadow.querySelector('[data-act="collapse"]').setAttribute("aria-expanded", String(!settings.overlay.collapsed));
        if (refs.enabled.checked !== settings.enabled) refs.enabled.checked = settings.enabled;

        if (!dragging && Number.isFinite(settings.overlay.x)) {
          const next = { x: settings.overlay.x, y: settings.overlay.y };
          if (next.x !== position.x || next.y !== position.y) {
            position = next;
            applyPosition();
          }
        }
      }

      if (status) {
        dot.dataset.phase = status.phase || "disabled";
        refs.phase.textContent = status.phase || "disabled";
        refs.target.textContent = status.target || "No field focused";
        refs.target.dataset.empty = String(!status.target);
        const total = status.total || 0;
        const index = Math.min(status.index || 0, total);
        refs.count.textContent = `${index} / ${total}`;
        refs.fill.style.width = total ? `${Math.round((index / total) * 100)}%` : "0%";

        refs.start.disabled = status.canStart !== true;
        refs.stop.disabled = status.canStop !== true;
        refs.note.textContent = status.detail || "";
        refs.note.hidden = !status.detail;
        refs.note.title = status.detail || "";
      }
    }

    function destroy() {
      global.removeEventListener("resize", onResize);
      head.removeEventListener("pointerdown", onPointerDown);
      shadow.removeEventListener("pointerdown", onButtonPointerDown);
      shadow.removeEventListener("click", onClick);
      shadow.removeEventListener("change", onToggle);
      host.remove();
      mounted = false;
    }

    return { mount, update, destroy, host };
  };
})(globalThis);
