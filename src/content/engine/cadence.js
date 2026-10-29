/**
 * content/engine/cadence.js — how long to wait before the next keystroke.
 *
 * Pure: no DOM, no extension APIs, no timers. That is deliberate — this is the
 * part of the engine most likely to be wrong, so it must be testable in Node with
 * a seeded RNG and no browser.
 *
 * The model, in one line:
 *
 *   delay = clip(gaussian(μ, σ·μ), 0.5μ, 2μ) × pauseMultiplier × burstMultiplier
 *
 * where μ = 60000 / (wpm × 5), because "words per minute" counts five characters
 * as a word. Context decides the multiplier: a newline is a read-the-last-line
 * beat, a closing brace is a shorter beat, a space is the shortest.
 *
 * Depends on: nothing (creates the namespace if it is absent, for Node tests).
 */

(function (global) {
  "use strict";

  const AT = (global.AutoTyper = global.AutoTyper || {});

  /** Characters that trigger a thinking beat, with the multiplier range applied. */
  const PAUSE_RULES = Object.freeze({
    newline: { characters: Object.freeze(["\n"]), min: 4, max: 8 },
    symbol: { characters: Object.freeze([";", ",", ")", "}", "]", ":", "="]), min: 1.5, max: 3 },
    word: { characters: Object.freeze([" "]), min: 1.2, max: 2.2 },
  });

  const BURST = Object.freeze({ chance: 0.08, minChars: 3, maxChars: 8, factor: 0.6 });

  /** Never emit a delay above this; a hung-looking engine is worse than a fast one. */
  const MAX_DELAY_MS = 5000;

  function wpmToCps(wpm) {
    // wpm counts 5 characters per "word", so cps = wpm × 5 / 60.
    return (wpm * 5) / 60;
  }

  function wpmToMeanMs(wpm) {
    return 60000 / (wpm * 5);
  }

  /**
   * mulberry32 — 32-bit seeded PRNG.
   *
   * Why not Math.random: tests must be deterministic, and a distribution claim
   * ("mean within 3%") can only be asserted against a fixed sequence.
   */
  function createRng(seed = (Date.now() >>> 0)) {
    let state = seed >>> 0;
    let spare = null;

    function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Box–Muller, with the second value cached so each pair costs one log/sqrt. */
    function gaussian() {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      spare = magnitude * Math.sin(2 * Math.PI * v);
      return magnitude * Math.cos(2 * Math.PI * v);
    }

    function range(min, max) {
      return min + next() * (max - min);
    }

    function int(min, max) {
      return Math.floor(range(min, max + 1));
    }

    return { next, gaussian, range, int, chance: (p) => next() < p };
  }

  /**
   * Build a sampler bound to a speed/rhythm configuration.
   *
   * @param {object} options
   * @param {number} options.wpm                 target speed, 30–50 in the UI
   * @param {boolean} [options.jitterEnabled]
   * @param {number} [options.sigma]             std-dev as a fraction of μ
   * @param {number} [options.minFactor]
   * @param {number} [options.maxFactor]
   * @param {number} [options.burstChance]
   * @param {{word?: boolean, symbol?: boolean, newline?: boolean}} [options.pauses]
   * @param {ReturnType<typeof createRng>} [options.rng]
   */
  function createSampler({
    wpm,
    jitterEnabled = true,
    sigma = 0.25,
    minFactor = 0.5,
    maxFactor = 2,
    burstChance = BURST.chance,
    pauses = {},
    rng = createRng(),
  } = {}) {
    const meanMs = wpmToMeanMs(wpm);
    if (!Number.isFinite(meanMs) || meanMs <= 0) {
      throw new RangeError(`createSampler: invalid wpm ${wpm}`);
    }

    let burstRemaining = 0;

    /**
     * @param {string} [previousChar] the character typed *before* this delay
     * @returns {{delayMs: number, reason: string, burst: boolean}}
     */
    function next(previousChar = "") {
      // 1. Base interval. Clipping bounds the tails; without it a Gaussian will
      //    occasionally hand us a multi-second pause that looks like a hang.
      let ms;
      if (jitterEnabled) {
        const sampled = meanMs + rng.gaussian() * sigma * meanMs;
        ms = Math.min(maxFactor * meanMs, Math.max(minFactor * meanMs, sampled));
      } else {
        ms = meanMs;
      }

      // 2. Context beat, driven by the character that was just typed.
      let reason = "plain";
      let multiplier = 1;
      if (pauses.newline !== false && PAUSE_RULES.newline.characters.includes(previousChar)) {
        reason = "newline";
        multiplier = rng.range(PAUSE_RULES.newline.min, PAUSE_RULES.newline.max);
      } else if (pauses.symbol !== false && PAUSE_RULES.symbol.characters.includes(previousChar)) {
        reason = "symbol";
        multiplier = rng.range(PAUSE_RULES.symbol.min, PAUSE_RULES.symbol.max);
      } else if (pauses.word !== false && PAUSE_RULES.word.characters.includes(previousChar)) {
        reason = "word";
        multiplier = rng.range(PAUSE_RULES.word.min, PAUSE_RULES.word.max);
      }

      // 3. Bursts: humans type in clumps, then slow down again. A burst is a run
      //    of characters, not an independent coin flip per keystroke.
      let burst = false;
      if (burstRemaining > 0) {
        burstRemaining -= 1;
        burst = true;
        multiplier *= BURST.factor;
      } else if (burstChance > 0 && rng.chance(burstChance) && reason === "plain") {
        burstRemaining = rng.int(BURST.minChars, BURST.maxChars) - 1;
        burst = true;
        multiplier *= BURST.factor;
      }

      return {
        delayMs: Math.max(1, Math.min(MAX_DELAY_MS, Math.round(ms * multiplier))),
        reason: burst && reason === "plain" ? "burst" : reason,
        burst,
      };
    }

    return {
      meanMs,
      /** Remaining characters in the active burst; exposed for tests/diagnostics. */
      get burstRemaining() {
        return burstRemaining;
      },
      next,
    };
  }

  AT.cadence = Object.freeze({
    PAUSE_RULES,
    BURST,
    MAX_DELAY_MS,
    wpmToCps,
    wpmToMeanMs,
    createRng,
    createSampler,
  });
})(globalThis);
