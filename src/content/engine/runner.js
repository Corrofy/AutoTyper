/**
 * content/engine/runner.js — the run state machine and the typing loop.
 *
 * WHAT IT OWNS
 *   The order of operations: prepare → per-character insert → wait → repeat, plus
 *   the rules for stopping. It does not know what a textarea is. An adapter does
 *   the DOM work; this file decides *when* and *whether* to ask.
 *
 * WHY THE LOOP IS CANCELLABLE
 *   A delay can be 4–8× the mean after a newline (up to seconds). A Stop button
 *   that only takes effect after the current sleep looks broken, so `stop()`
 *   resolves the pending wait and the loop exits at the next check.
 *
 * WHY `stack` INSTEAD OF AN OFFSET
 *   A human sometimes backspaces past the wrong character and deletes a correct
 *   one too. The runner must retype from the right place, and the amount of text
 *   it may delete is bounded by what *this run* inserted — never the user's
 *   pre-existing text before the caret. A stack of inserted snippet indices
 *   answers both questions: how far back can we correct, and where do we resume?
 *   It also makes skipped newlines (single-line inputs) harmless.
 *
 * INJECTION POINTS
 *   `getTarget`, `getSettings`, `resolveAdapter`, `sleep`, `isTargetActive`, and
 *   the RNG seed are all supplied by the caller. That is what lets the unit tests
 *   run the real loop with fake DOM objects and a zero-cost sleep.
 *
 * Depends on: content/engine/cadence.js, content/engine/mistakes.js.
 */

(function (global) {
  "use strict";

  const AT = (global.AutoTyper = global.AutoTyper || {});

  function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function defaultIsTargetActive(target) {
    const doc = target && target.ownerDocument;
    if (!doc || !doc.activeElement) return true;
    return doc.activeElement === target;
  }

  /** A result object from an adapter, normalised to a stop reason. */
  function reasonOf(result, fallback) {
    return (result && result.reason) || fallback;
  }

  /**
   * @param {object} options
   * @param {() => Element|null} options.getTarget
   * @param {() => object} options.getSettings
   * @param {(element: Element) => object|null} options.resolveAdapter
   * @param {(ms: number) => Promise<void>} [options.sleep]
   * @param {(element: Element) => boolean} [options.isTargetActive]
   * @param {(state: object) => void} [options.onState]
   * @param {(state: object) => void} [options.onDone]
   * @param {number} [options.seed] fixed RNG seed (tests / diagnostics)
   */
  AT.createRunner = function createRunner({
    getTarget,
    getSettings,
    resolveAdapter,
    sleep = defaultSleep,
    isTargetActive = defaultIsTargetActive,
    onState,
    onDone,
    seed,
  } = {}) {
    if (typeof getTarget !== "function") throw new TypeError("createRunner: getTarget is required");
    if (typeof getSettings !== "function") throw new TypeError("createRunner: getSettings is required");
    if (typeof resolveAdapter !== "function") throw new TypeError("createRunner: resolveAdapter is required");
    if (!AT.cadence || !AT.mistakes) throw new Error("createRunner: cadence.js and mistakes.js must load first");

    let current = null;
    let serial = 0;
    let last = { phase: "idle", reason: "idle", index: 0, total: 0, skipped: 0, adapter: null };

    function notify(handler, state) {
      if (typeof handler !== "function") return;
      try {
        handler(state);
      } catch (err) {
        // A broken UI callback must not kill a run that is otherwise fine.
        AT.protocol?.log?.warn("runner callback threw", err && err.message ? err.message : err);
      }
    }

    function setState(state) {
      last = state;
      notify(onState, state);
      return state;
    }

    function progress(run, reason) {
      return setState({
        phase: "typing",
        reason: reason || "typing",
        index: run.confirmed,
        total: run.total,
        skipped: run.skipped,
        adapter: run.adapter.name,
      });
    }

    function stopState(reason, total, phase = "stopped") {
      const state = { phase, reason, index: 0, total: total || 0, skipped: 0, adapter: null };
      setState(state);
      notify(onDone, state);
      return { started: false, state };
    }

    function targetProblem(target) {
      if (!target || !target.isConnected) return "target-removed";
      if (target.disabled || target.readOnly) return "target-disabled";
      try {
        if (isTargetActive(target) === false) return "focus-lost";
      } catch {
        /* a throwing focus check is not evidence the target is gone */
      }
      return null;
    }

    function lastSnippetIndex(stack) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index] >= 0) return stack[index];
      }
      return -1;
    }

    function hasRemaining(run) {
      return run.cursor <= run.lastTypable;
    }

    /**
     * Wait, but let `stop()` cut it short. The injected sleep is wrapped rather
     * than replaced so tests still control time.
     */
    function wait(run, ms) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (run.wake === finish) run.wake = null;
          resolve();
        };
        run.wake = finish;
        Promise.resolve()
          .then(() => sleep(ms))
          .then(finish, finish);
      });
    }

    function end(run, phase, reason, message) {
      if (current !== run) return;
      current = null;
      run.cancelled = true;
      const state = {
        phase,
        reason,
        message: message || null,
        index: run.confirmed,
        total: run.total,
        // On a single-line target every newline is skipped by definition; the
        // loop may finish before walking the trailing ones, so report the whole
        // count rather than the number visited.
        skipped: run.supportsNewline ? 0 : run.newlines,
        adapter: run.adapter.name,
      };
      last = state;
      notify(onState, state);
      notify(onDone, state);
    }

    async function loop(run) {
      try {
        if (run.mode === "replace") {
          const prepared = run.adapter.prepare(run.target, "replace");
          if (!prepared || prepared.ok !== true) {
            return end(run, "error", reasonOf(prepared, "replace-failed"));
          }
        }

        const rng = AT.cadence.createRng(seed ?? (Date.now() >>> 0));
        const sampler = AT.cadence.createSampler({
          wpm: run.wpm,
          jitterEnabled: run.settings.jitter?.enabled !== false,
          sigma: run.settings.jitter?.sigma,
          minFactor: run.settings.jitter?.minFactor,
          maxFactor: run.settings.jitter?.maxFactor,
          burstChance: run.settings.pauses?.burstChance,
          pauses: {
            word: run.settings.pauses?.word,
            symbol: run.settings.pauses?.symbol,
            newline: run.settings.pauses?.newline,
          },
          rng,
        });

        const planner = run.settings.mistakes?.enabled === false
          ? null
          : AT.mistakes.createPlanner({
              rate: run.settings.mistakes?.rate,
              minPauseMs: run.settings.mistakes?.minPauseMs,
              maxPauseMs: run.settings.mistakes?.maxPauseMs,
              rng,
            });

        while (!run.cancelled) {
          const live = getSettings();
          if (!live || live.enabled === false) return end(run, "stopped", "disabled");

          const problem = targetProblem(run.target);
          if (problem) return end(run, "error", problem);

          if (!hasRemaining(run)) return end(run, "done", "complete");

          const cursor = run.cursor;
          const char = run.text[cursor];

          if (char === "\n" && !run.supportsNewline) {
            // A single-line <input> cannot contain a newline. Skip it instead of
            // silently turning it into a space, and count it for the UI.
            run.cursor += 1;
            run.skipped += 1;
            progress(run, "skipping-newline");
            continue;
          }

          let plan = null;
          if (planner && cursor > run.slipFreeThrough) plan = planner.plan(char);
          // A correction suppresses slips up to and including the position that
          // was being typed. Without this, a high mistake rate can slip on the
          // same character forever: correct, rewind, slip again at the exact
          // same spot. Humans do not do that, and the loop must terminate.

          if (plan) {
            const wrong = await run.adapter.insert(run.target, plan.wrongChar);
            if (run.cancelled) break;
            if (!wrong || wrong.ok !== true) return end(run, "error", reasonOf(wrong, "insert-failed"));

            run.stack.push(-1);
            progress(run, "mistake");

            await wait(run, plan.pauseMs);
            if (run.cancelled) break;

            // Never delete text this run did not type: `stack.length` is the
            // number of characters since the run started.
            const deletions = Math.min(plan.backspaces, run.stack.length);
            for (let press = 0; press < deletions; press += 1) {
              if (run.cancelled) break;
              const deleted = run.adapter.backspace(run.target);
              if (!deleted || deleted.ok !== true) return end(run, "error", reasonOf(deleted, "backspace-failed"));

              const removed = run.stack.pop();
              if (removed >= 0) run.confirmed = Math.max(0, run.confirmed - 1);
              progress(run, "correcting");

              if (press < deletions - 1) await wait(run, Math.max(60, Math.round(sampler.meanMs * 0.5)));
            }
            if (run.cancelled) break;

            run.cursor = Math.max(0, Math.min(lastSnippetIndex(run.stack) + 1, run.text.length));
            run.slipFreeThrough = Math.max(run.slipFreeThrough, cursor);
            continue;
          }

          const inserted = await run.adapter.insert(run.target, char);
          if (run.cancelled) break;
          if (!inserted || inserted.ok !== true) return end(run, "error", reasonOf(inserted, "insert-failed"));

          run.stack.push(cursor);
          run.cursor = cursor + 1;
          run.confirmed += 1;
          progress(run, "typing");

          if (!hasRemaining(run)) return end(run, "done", "complete");

          const timing = sampler.next(char);
          await wait(run, timing.delayMs);
        }

        if (current === run) end(run, "stopped", run.stopReason || "stopped");
      } catch (err) {
        end(run, "error", "internal-error", err && err.message ? err.message : String(err));
      }
    }

    /**
     * Kick off a run. Validation failures are reported as a finished state (not
     * a thrown error), because "no field focused" is a normal user situation.
     */
    function start() {
      if (current) return { started: false, state: last };

      const settings = getSettings();
      const text = String(settings?.snippet?.text || "").replace(/\r\n?/g, "\n");

      if (!settings?.enabled) return stopState("disabled", text.length);
      if (!text) return stopState("empty-snippet", 0);

      const target = getTarget();
      if (!target) return stopState("no-target", text.length, "error");
      if (!target.isConnected) return stopState("target-removed", text.length, "error");
      if (isTargetActive(target) === false) return stopState("focus-lost", text.length, "error");

      const adapter = resolveAdapter(target);
      if (!adapter) return stopState("unsupported-target", text.length, "error");

      const supportsNewline =
        typeof adapter.supportsNewline === "function" ? adapter.supportsNewline(target) !== false : true;
      const newlines = (text.match(/\n/g) || []).length;
      const total = supportsNewline ? text.length : text.length - newlines;
      if (total <= 0) return stopState("empty-snippet", 0);

      let lastTypable = -1;
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] !== "\n" || supportsNewline) lastTypable = index;
      }

      const run = {
        id: (serial += 1),
        target,
        adapter,
        text,
        total,
        supportsNewline,
        newlines,
        lastTypable,
        wpm: settings.speed?.wpm ?? 40,
        mode: settings.mode === "replace" ? "replace" : "insert",
        settings,
        cancelled: false,
        stopReason: null,
        wake: null,
        stack: [],
        cursor: 0,
        confirmed: 0,
        skipped: 0,
        slipFreeThrough: -1,
      };
      current = run;
      setState({
        phase: "typing",
        reason: "started",
        index: 0,
        total,
        skipped: 0,
        adapter: adapter.name,
      });

      void loop(run);
      return { started: true, state: last };
    }

    function stop(reason = "stopped") {
      if (!current) return last;
      current.stopReason = reason;
      current.cancelled = true;
      const wake = current.wake;
      current.wake = null;
      if (wake) wake();
      return last;
    }

    return {
      start,
      stop,
      getState() {
        return last;
      },
      isActive() {
        return current !== null;
      },
    };
  };
})(globalThis);
