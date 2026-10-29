/**
 * test/unit/mistakes.test.js — the error layer.
 *
 * The interesting assertions are physical, not statistical:
 *   - neighbours must be symmetric (if s is next to a, a is next to s)
 *   - a mistake must be a key a hand could actually hit
 *   - no letter may be its own neighbour
 *   - rate 1 means "always", rate 0 means "never", with nothing in between
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require(path.join(__dirname, "..", "..", "src", "content", "engine", "cadence.js"));
require(path.join(__dirname, "..", "..", "src", "content", "engine", "mistakes.js"));

const cadence = globalThis.AutoTyper.cadence;
const mistakes = globalThis.AutoTyper.mistakes;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

test("the layout covers every letter exactly once", () => {
  const keys = mistakes.LAYOUT.flatMap((row) => [...row.keys]);
  assert.equal(keys.length, new Set(keys).size);

  const letters = keys.filter((key) => /^[a-z]$/.test(key));
  assert.deepEqual(letters.sort(), [...ALPHABET].sort());
});

test("every letter has human-plausible neighbours", () => {
  for (const letter of ALPHABET) {
    const near = mistakes.NEIGHBORS[letter];
    assert.ok(Array.isArray(near) && near.length > 0, `${letter} has no neighbours`);
    assert.ok(!near.includes(letter), `${letter} is its own neighbour`);

    for (const neighbour of near) {
      assert.match(neighbour, /^[a-z]$/, `${letter} → ${neighbour} is not a letter`);
      // A slip is a physical event: adjacency must be mutual.
      assert.ok(mistakes.NEIGHBORS[neighbour].includes(letter), `${letter} → ${neighbour} is not symmetric`);
    }
  }
});

test("the home row is adjacent in the way a hand would expect", () => {
  // Derived from the stagger offsets, not typed by hand. 'a' is surrounded by
  // q/w/s/z; anything else means the geometry changed.
  assert.deepEqual(mistakes.NEIGHBORS.a, ["q", "s", "w", "z"]);

  // Pairs that share a hand and touch: far more likely slips than d↔p.
  for (const [left, right] of [
    ["a", "s"],
    ["s", "d"],
    ["f", "g"],
    ["j", "k"],
    ["e", "r"],
    ["u", "i"],
  ]) {
    assert.ok(mistakes.NEIGHBORS[left].includes(right), `${left} should neighbour ${right}`);
  }
});

test("neighboursOf preserves case and ignores non-letters", () => {
  assert.deepEqual(mistakes.neighborsOf("a"), mistakes.NEIGHBORS.a);
  assert.deepEqual(mistakes.neighborsOf("A"), mistakes.NEIGHBORS.a.map((key) => key.toUpperCase()));
  assert.deepEqual(mistakes.neighborsOf("1"), []);
  assert.deepEqual(mistakes.neighborsOf(";"), []);
  assert.deepEqual(mistakes.neighborsOf(""), []);
  assert.deepEqual(mistakes.neighborsOf("ab"), []);
  assert.deepEqual(mistakes.neighborsOf(null), []);
});

test("rate 0 never makes a mistake", () => {
  const planner = mistakes.createPlanner({ rate: 0, rng: cadence.createRng(1) });
  for (let i = 0; i < 200; i += 1) {
    assert.equal(planner.plan("a"), null);
  }
});

test("rate 1 always mistakes on letters, never on other characters", () => {
  const planner = mistakes.createPlanner({ rate: 1, minPauseMs: 300, maxPauseMs: 600, rng: cadence.createRng(2) });

  for (let i = 0; i < 200; i += 1) {
    const plan = planner.plan("a");
    assert.ok(plan, "expected a mistake on a letter");
    assert.ok(mistakes.NEIGHBORS.a.includes(plan.wrongChar), `wrongChar ${plan.wrongChar}`);
    assert.ok([1, 2, 3].includes(plan.backspaces));
    assert.ok(Number.isInteger(plan.pauseMs));
    assert.ok(plan.pauseMs >= 300 && plan.pauseMs <= 600);
  }

  for (const char of ["1", " ", "\n", ";", "!", "é", ""]) {
    assert.equal(planner.plan(char), null, `unexpected mistake on ${JSON.stringify(char)}`);
  }
});

test("mistakes are usually one backspace, sometimes an over-correction", () => {
  const planner = mistakes.createPlanner({ rate: 1, rng: cadence.createRng(3) });
  const counts = new Map();
  for (let i = 0; i < 5000; i += 1) {
    const { backspaces } = planner.plan("s");
    counts.set(backspaces, (counts.get(backspaces) || 0) + 1);
  }

  const oneShare = counts.get(1) / 5000;
  assert.ok(oneShare > 0.75 && oneShare < 0.85, `single backspace share was ${oneShare}`);
  assert.ok(counts.get(2) > 0, "expected some two-backspace corrections");
  assert.ok(counts.get(3) > 0, "expected some three-backspace corrections");
});

test("the configured rate is the observed rate", () => {
  const planner = mistakes.createPlanner({ rate: 0.03, rng: cadence.createRng(4) });
  const trials = 10000;
  let hits = 0;
  for (let i = 0; i < trials; i += 1) {
    if (planner.plan("e")) hits += 1;
  }
  const observed = hits / trials;
  // 300 expected; ±1 percentage point is ~6σ, so this cannot flake.
  assert.ok(Math.abs(observed - 0.03) < 0.01, `observed rate ${observed}`);
});

test("same seed produces the same sequence of mistakes", () => {
  const a = mistakes.createPlanner({ rate: 0.5, rng: cadence.createRng(5) });
  const b = mistakes.createPlanner({ rate: 0.5, rng: cadence.createRng(5) });

  for (let i = 0; i < 100; i += 1) {
    assert.deepEqual(a.plan("k"), b.plan("k"));
  }
});

test("invalid configuration fails loudly", () => {
  assert.throws(() => mistakes.createPlanner({ rate: 0.03 }), TypeError);
  assert.throws(() => mistakes.createPlanner({ rate: -0.1, rng: cadence.createRng(1) }), RangeError);
  assert.throws(() => mistakes.createPlanner({ rate: 1.1, rng: cadence.createRng(1) }), RangeError);
});
