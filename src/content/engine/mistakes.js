/**
 * content/engine/mistakes.js — the "human" error layer.
 *
 * A perfect typist is as suspicious as a 900 WPM typist, so the engine
 * occasionally types a neighbouring key, notices, backspaces, and continues.
 *
 * The adjacency table is *derived from a keyboard layout*, not hand-written.
 * Hand-written neighbour lists are where this kind of code quietly rots: a typo
 * in the table produces a "mistake" that no human could physically make.
 *
 * Pure: no DOM, no timers. Depends on nothing.
 */

(function (global) {
  "use strict";

  const AT = (global.AutoTyper = global.AutoTyper || {});

  /**
   * Physical key positions, in "key units".
   *
   * Each row's `offset` models the real stagger: digits start at 0, QWERTY is
   * shifted right half a key, ASDF three quarters, ZXCV one and a quarter.
   * Without the offsets every key would look equidistant and the "adjacent"
   * mistakes would be meaningless.
   */
  const LAYOUT = Object.freeze([
    Object.freeze({ row: 0, offset: 0.0, keys: "1234567890" }),
    Object.freeze({ row: 1, offset: 0.5, keys: "qwertyuiop" }),
    Object.freeze({ row: 2, offset: 0.75, keys: "asdfghjkl;" }),
    Object.freeze({ row: 3, offset: 1.25, keys: "zxcvbnm,./" }),
  ]);

  /** Keys closer than this (in key units) count as "adjacent" for a slip. */
  const NEIGHBOR_DISTANCE = 1.3;

  const LETTER = /^[a-z]$/;

  function buildNeighbors() {
    const positions = new Map();
    for (const { row, offset, keys } of LAYOUT) {
      [...keys].forEach((key, column) => {
        positions.set(key, { x: column + offset, y: row });
      });
    }

    const table = {};
    for (const [key, a] of positions) {
      if (!LETTER.test(key)) continue;
      const near = [];
      for (const [other, b] of positions) {
        if (other === key || !LETTER.test(other)) continue;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance <= NEIGHBOR_DISTANCE) near.push(other);
      }
      table[key] = Object.freeze(near.sort());
    }
    return Object.freeze(table);
  }

  const NEIGHBORS = buildNeighbors();

  /**
   * Adjacent keys for a character, preserving case.
   * Returns a frozen array; empty for anything that is not a letter.
   */
  function neighborsOf(char) {
    if (typeof char !== "string" || char.length !== 1) return [];
    const lower = char.toLowerCase();
    if (!LETTER.test(lower)) return [];
    const near = NEIGHBORS[lower] || [];
    return char === lower ? near : near.map((key) => key.toUpperCase());
  }

  /**
   * @param {object} options
   * @param {number} [options.rate]        probability per typed letter (0–0.2)
   * @param {number} [options.minPauseMs]  shortest "oh no" pause
   * @param {number} [options.maxPauseMs]
   * @param {ReturnType<import('./cadence.js')>} [options.rng]
   */
  function createPlanner({ rate = 0.03, minPauseMs = 300, maxPauseMs = 600, rng } = {}) {
    if (!rng) throw new TypeError("createPlanner: an rng is required");
    if (rate < 0 || rate > 1) throw new RangeError(`createPlanner: invalid rate ${rate}`);

    /**
     * @param {string} char the character the engine is about to type
     * @returns {null | {wrongChar: string, backspaces: number, pauseMs: number}}
     */
    function plan(char) {
      // Mistakes only happen on letters. Slipping a digit into prose looks like a
      // bug, and slipping a key onto a space or a brace is not physically
      // plausible in the same way.
      if (typeof char !== "string" || char.length !== 1 || !LETTER.test(char.toLowerCase())) return null;
      if (rate <= 0 || !rng.chance(rate)) return null;

      const candidates = neighborsOf(char);
      if (!candidates.length) return null;

      const wrongChar = candidates[rng.int(0, candidates.length - 1)];

      // Usually one backspace (delete the wrong key). Sometimes a human
      // over-corrects and deletes a correct character too — that is the point of
      // allowing 2–3, and it is why the engine must re-check document state after
      // a correction rather than assuming it typed exactly one character.
      const roll = rng.next();
      const backspaces = roll < 0.8 ? 1 : roll < 0.93 ? 2 : 3;

      return {
        wrongChar,
        backspaces,
        pauseMs: Math.round(rng.range(minPauseMs, maxPauseMs)),
      };
    }

    return { rate, plan };
  }

  AT.mistakes = Object.freeze({
    LAYOUT,
    NEIGHBOR_DISTANCE,
    NEIGHBORS,
    neighborsOf,
    createPlanner,
  });
})(globalThis);
