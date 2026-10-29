/**
 * test/unit/cadence.test.js — the rhythm model.
 *
 * Statistical assertions are run against a SEEDED generator, so they are
 * deterministic: a failure means the distribution actually changed, not that the
 * machine was unlucky. Tolerances are wide enough to survive refactoring the
 * sampler internals, narrow enough to catch a broken mean or a missing clip.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require(path.join(__dirname, "..", "..", "src", "content", "engine", "cadence.js"));
const cadence = globalThis.AutoTyper.cadence;

const MEAN_40 = 300; // 60000 / (40 × 5)

/** Sample `count` delays from a fresh seeded sampler. */
function samples({ count = 20000, seed = 42, previous = "x", ...options } = {}) {
  const sampler = cadence.createSampler({
    wpm: 40,
    rng: cadence.createRng(seed),
    burstChance: 0,
    pauses: { word: false, symbol: false, newline: false },
    ...options,
  });
  return Array.from({ length: count }, () => sampler.next(previous).delayMs);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values, average = mean(values)) {
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

test("speed maths: WPM counts five characters per word", () => {
  assert.equal(cadence.wpmToMeanMs(40), 300);
  assert.equal(cadence.wpmToMeanMs(30), 400);
  assert.equal(cadence.wpmToMeanMs(50), 240);

  assert.ok(Math.abs(cadence.wpmToCps(40) - 10 / 3) < 1e-12);
  assert.ok(Math.abs(cadence.wpmToCps(30) - 2.5) < 1e-12);
  assert.ok(Math.abs(cadence.wpmToCps(50) - 25 / 6) < 1e-12);
});

test("same seed produces the same rhythm", () => {
  const a = samples({ count: 200, seed: 7 });
  const b = samples({ count: 200, seed: 7 });
  const c = samples({ count: 200, seed: 8 });

  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("jitter disabled holds the mean exactly", () => {
  const values = samples({ count: 50, jitterEnabled: false });
  assert.ok(values.every((value) => value === MEAN_40), `got ${[...new Set(values)]}`);
});

test("sampled mean is within 3% of the target", () => {
  const values = samples({ count: 20000 });
  const observed = mean(values);
  assert.ok(
    Math.abs(observed - MEAN_40) <= MEAN_40 * 0.03,
    `mean ${observed.toFixed(2)}ms is outside 3% of ${MEAN_40}ms`,
  );
});

test("clipping bounds the Gaussian tails", () => {
  const values = samples({ count: 20000 });
  const lo = MEAN_40 * 0.5;
  const hi = MEAN_40 * 2;
  const outside = values.filter((value) => value < lo || value > hi);
  assert.equal(outside.length, 0, `${outside.length} samples outside [${lo}, ${hi}]`);
});

test("about 68% of samples land within one sigma", () => {
  // σ = 25% of μ, so one sigma is 225–375ms. A Gaussian puts ~68% there; this is
  // the check that would catch a sampler that "jitters" by ±5% and calls it done.
  const values = samples({ count: 20000 });
  const within = values.filter((value) => value >= 225 && value <= 375).length / values.length;
  assert.ok(within > 0.63 && within < 0.73, `share within one sigma was ${(within * 100).toFixed(1)}%`);
});

test("Gaussian generator has mean 0 and standard deviation 1", () => {
  const rng = cadence.createRng(1234);
  const values = Array.from({ length: 20000 }, () => rng.gaussian());
  const average = mean(values);
  const sd = stdev(values, average);

  assert.ok(Math.abs(average) < 0.05, `mean was ${average}`);
  assert.ok(Math.abs(sd - 1) < 0.05, `sd was ${sd}`);
});

test("newlines pause 4–8× longer than a plain character", () => {
  const sampler = cadence.createSampler({
    wpm: 40,
    jitterEnabled: false,
    rng: cadence.createRng(3),
    pauses: {},
    burstChance: 0,
  });

  const plain = sampler.next("x");
  assert.equal(plain.reason, "plain");
  assert.equal(plain.delayMs, 300);

  // Sample several times: the multiplier is itself random inside the rule.
  const deltas = Array.from({ length: 200 }, () => sampler.next("\n"));
  assert.ok(deltas.every((sample) => sample.reason === "newline"));
  assert.ok(deltas.every((sample) => sample.delayMs >= 1200 && sample.delayMs <= 2400));
});

test("symbols and spaces use their own pauses, and can be disabled", () => {
  const sampler = cadence.createSampler({
    wpm: 40,
    jitterEnabled: false,
    rng: cadence.createRng(4),
    pauses: {},
    burstChance: 0,
  });

  for (const symbol of [";", ",", ")", "}", "]", ":", "="]) {
    const sample = sampler.next(symbol);
    assert.equal(sample.reason, "symbol", symbol);
    assert.ok(sample.delayMs >= 450 && sample.delayMs <= 900, `${symbol} → ${sample.delayMs}`);
  }

  const space = sampler.next(" ");
  assert.equal(space.reason, "word");
  assert.ok(space.delayMs >= 360 && space.delayMs <= 660);

  const noPauses = cadence.createSampler({
    wpm: 40,
    jitterEnabled: false,
    rng: cadence.createRng(5),
    pauses: { word: false, symbol: false, newline: false },
    burstChance: 0,
  });
  assert.equal(noPauses.next("\n").reason, "plain");
  assert.equal(noPauses.next(";").reason, "plain");
  assert.equal(noPauses.next(" ").reason, "plain");
});

test("bursts are runs of fast characters, not per-key coin flips", () => {
  const sampler = cadence.createSampler({
    wpm: 40,
    jitterEnabled: false,
    rng: cadence.createRng(6),
    pauses: {},
    burstChance: 1,
  });

  const first = sampler.next("x");
  assert.equal(first.reason, "burst");
  assert.equal(first.delayMs, 180); // 300 × 0.6
  assert.ok(sampler.burstRemaining >= 2 && sampler.burstRemaining <= 7, `remaining ${sampler.burstRemaining}`);

  // Every keystroke in a burst costs the same factor, so a burst-heavy run must
  // be clearly faster than the target mean.
  const values = Array.from({ length: 500 }, () => sampler.next("x").delayMs);
  assert.ok(mean(values) < 250, `burst mean was ${mean(values)}`);
});

test("a pathological configuration is clamped, never hung", () => {
  const slow = cadence.createSampler({ wpm: 1, jitterEnabled: false, rng: cadence.createRng(9) });
  assert.equal(slow.next("x").delayMs, cadence.MAX_DELAY_MS);

  const noDelay = cadence.createSampler({
    wpm: 40,
    jitterEnabled: false,
    rng: cadence.createRng(9),
    pauses: { word: false, symbol: false, newline: false },
  });
  assert.ok(noDelay.next("x").delayMs >= 1);
});

test("invalid speeds are rejected instead of producing NaN timers", () => {
  for (const wpm of [0, -40, NaN, Infinity]) {
    assert.throws(() => cadence.createSampler({ wpm }), RangeError, `wpm ${wpm}`);
  }
  assert.throws(() => cadence.createSampler({}), RangeError);
});
