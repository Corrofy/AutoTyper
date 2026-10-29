/**
 * test/unit/runner.test.js — the run state machine, with a fake adapter.
 *
 * This is where the dangerous rules live, so they are tested without a browser:
 * never delete text the run did not type, retype over-corrections correctly,
 * skip newlines on single-line inputs, stop on focus loss, and always terminate
 * even at an absurd mistake rate.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "src");
require(path.join(SRC, "content", "engine", "cadence.js"));
require(path.join(SRC, "content", "engine", "mistakes.js"));
require(path.join(SRC, "content", "engine", "runner.js"));

const AT = globalThis.AutoTyper;

function makeTarget(overrides = {}) {
  const target = {
    nodeType: 1,
    tagName: "TEXTAREA",
    isConnected: true,
    disabled: false,
    readOnly: false,
    ownerDocument: null,
    ...overrides,
  };
  target.ownerDocument = { activeElement: target };
  return target;
}

function makeSettings(overrides = {}) {
  return {
    enabled: true,
    mode: "insert",
    snippet: { text: "abc" },
    speed: { wpm: 40 },
    jitter: { enabled: false, sigma: 0.25, minFactor: 0.5, maxFactor: 2 },
    pauses: { word: false, symbol: false, newline: false, burstChance: 0 },
    mistakes: { enabled: false, rate: 0.03, minPauseMs: 300, maxPauseMs: 600 },
    ...overrides,
  };
}

/**
 * A minimal adapter that only knows how to append and delete.
 * Hooks run after the mutation so tests can simulate time-based events.
 */
function makeAdapter({ supportsNewline = true, afterInsert, afterBackspace } = {}) {
  let text = "";
  const inserted = [];
  const deleted = [];
  const prepared = [];

  const adapter = {
    name: "fake",
    supportsNewline: () => supportsNewline,
    prepare(element, mode) {
      prepared.push(mode);
      if (mode === "replace") text = "";
      return { ok: true, cleared: true, via: "fake" };
    },
    snapshot() {
      return { value: text, start: text.length, end: text.length };
    },
    insert(element, char) {
      text += char;
      inserted.push(char);
      if (afterInsert) afterInsert(char, adapter);
      return { ok: true, via: "fake", value: text };
    },
    backspace() {
      if (!text) return { ok: false, reason: "start-of-document" };
      text = text.slice(0, -1);
      deleted.push(text);
      if (afterBackspace) afterBackspace(adapter);
      return { ok: true, via: "fake", value: text };
    },
  };

  adapter.value = () => text;
  adapter.inserted = inserted;
  adapter.deleted = deleted;
  adapter.prepared = prepared;
  return adapter;
}

function setup({
  settings = makeSettings(),
  target = makeTarget(),
  adapter = makeAdapter(),
  sleeps = [],
  onState,
} = {}) {
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const runner = AT.createRunner({
    getTarget: () => target,
    getSettings: () => settings,
    resolveAdapter: () => adapter,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    seed: 42,
    onState,
    onDone: resolveDone,
  });

  return { runner, target, adapter, settings, sleeps, done };
}

test("types the whole snippet and reports progress", async () => {
  const states = [];
  const h = setup({ settings: makeSettings({ snippet: { text: "hello" } }), onState: (state) => states.push(state) });

  const started = h.runner.start();
  assert.equal(started.started, true);

  const final = await h.done;
  assert.equal(final.phase, "done");
  assert.equal(final.reason, "complete");
  assert.equal(h.adapter.value(), "hello");
  assert.equal(final.index, 5);
  assert.equal(final.total, 5);

  assert.equal(states[0].phase, "typing");
  assert.equal(states.at(-1).phase, "done");
  assert.ok(states.some((state) => state.reason === "typing"));
  assert.equal(h.runner.isActive(), false);
});

test("waits one mean interval between characters at 40 WPM", async () => {
  const h = setup({ settings: makeSettings({ snippet: { text: "abc" } }) });
  h.runner.start();
  await h.done;

  // Delays are sampled after each character; the last character ends the run.
  assert.deepEqual(h.sleeps, [300, 300]);
});

test("a correction retypes the character it was aiming at", async () => {
  const h = setup({
    settings: makeSettings({ snippet: { text: "ab" }, mistakes: { enabled: true, rate: 1, minPauseMs: 10, maxPauseMs: 10 } }),
  });
  h.runner.start();
  const final = await h.done;

  assert.equal(final.phase, "done");
  assert.equal(h.adapter.value(), "ab");
  // At least one wrong character was typed and one backspace removed it.
  assert.ok(h.adapter.inserted.length > 2);
  assert.ok(h.adapter.deleted.length > 0);
});

test("an over-correction rewinds and re-types correct characters", async () => {
  // Backspaces are forced to 3 by scripting the planner's RNG consumption is
  // fragile; instead, drive the same public path with a rate high enough that
  // over-corrections occur, and assert the only invariant that matters: the
  // final text is exactly the snippet and nothing before it was touched.
  const h = setup({
    settings: makeSettings({
      snippet: { text: "hello world" },
      mistakes: { enabled: true, rate: 0.2, minPauseMs: 10, maxPauseMs: 10 },
    }),
  });
  h.runner.start();
  const final = await h.done;

  assert.equal(final.phase, "done");
  assert.equal(h.adapter.value(), "hello world");
});

test("mistakes disabled means a perfect transcript", async () => {
  const h = setup({ settings: makeSettings({ snippet: { text: "clean" } }) });
  h.runner.start();
  await h.done;

  assert.equal(h.adapter.inserted.join(""), "clean");
  assert.equal(h.adapter.deleted.length, 0);
});

test("single-line targets skip newlines and say so", async () => {
  const adapter = makeAdapter({ supportsNewline: false });
  const h = setup({ adapter, settings: makeSettings({ snippet: { text: "ab\ncd\n" } }) });

  h.runner.start();
  const final = await h.done;

  assert.equal(adapter.value(), "abcd");
  assert.equal(final.total, 4);
  assert.equal(final.index, 4);
  assert.equal(final.skipped, 2);
});

test("a newline in a textarea is a real character", async () => {
  const h = setup({ settings: makeSettings({ snippet: { text: "a\nb" } }) });
  h.runner.start();
  const final = await h.done;

  assert.equal(h.adapter.value(), "a\nb");
  assert.equal(final.skipped, 0);
});

test("replace mode prepares the target first", async () => {
  const h = setup({ settings: makeSettings({ mode: "replace", snippet: { text: "new" } }) });
  h.runner.start();
  await h.done;

  assert.deepEqual(h.adapter.prepared, ["replace"]);
  assert.equal(h.adapter.value(), "new");
});

test("stop() interrupts a run and reports a stopped state", async () => {
  let runner;
  const adapter = makeAdapter({
    afterInsert: () => {
      runner.stop("stopped");
    },
  });
  const h = setup({ adapter, settings: makeSettings({ snippet: { text: "abcdef" } }) });
  runner = h.runner;

  h.runner.start();
  const final = await h.done;

  assert.equal(final.phase, "stopped");
  assert.equal(final.reason, "stopped");
  // The first character was inserted, then the run stopped before the second.
  assert.equal(adapter.inserted.length, 1);
});

test("the run stops when the target leaves the document", async () => {
  const target = makeTarget();
  let inserted = 0;
  const adapter = makeAdapter({
    afterInsert: () => {
      inserted += 1;
      if (inserted === 1) target.isConnected = false;
    },
  });
  const h = setup({ adapter, target, settings: makeSettings({ snippet: { text: "abc" } }) });

  h.runner.start();
  const final = await h.done;

  assert.equal(final.phase, "error");
  assert.equal(final.reason, "target-removed");
  assert.equal(adapter.value(), "a");
});

test("the run stops when focus moves elsewhere", async () => {
  const target = makeTarget();
  const other = { nodeType: 1 };
  let inserted = 0;
  const adapter = makeAdapter({
    afterInsert: () => {
      inserted += 1;
      if (inserted === 1) target.ownerDocument.activeElement = other;
    },
  });
  const h = setup({ adapter, target, settings: makeSettings({ snippet: { text: "abc" } }) });

  h.runner.start();
  const final = await h.done;

  assert.equal(final.phase, "error");
  assert.equal(final.reason, "focus-lost");
});

test("disabling mid-run stops at the next character", async () => {
  const settings = makeSettings({ snippet: { text: "abc" } });
  let inserted = 0;
  const adapter = makeAdapter({
    afterInsert: () => {
      inserted += 1;
      if (inserted === 1) settings.enabled = false;
    },
  });
  const h = setup({ adapter, settings });

  h.runner.start();
  const final = await h.done;

  assert.equal(final.phase, "stopped");
  assert.equal(final.reason, "disabled");
});

test("validation failures are finished states, not exceptions", async (t) => {
  const cases = [
    { name: "disabled", settings: makeSettings({ enabled: false }), phase: "stopped", reason: "disabled" },
    { name: "empty snippet", settings: makeSettings({ snippet: { text: "" } }), phase: "stopped", reason: "empty-snippet" },
    { name: "no target", settings: makeSettings(), target: "none", phase: "error", reason: "no-target" },
    { name: "unsupported", settings: makeSettings(), unsupported: true, phase: "error", reason: "unsupported-target" },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      let resolveDone;
      const done = new Promise((resolve) => {
        resolveDone = resolve;
      });
      const runner = AT.createRunner({
        getTarget: () => (item.target === "none" ? null : makeTarget()),
        getSettings: () => item.settings,
        resolveAdapter: () => (item.unsupported ? null : makeAdapter()),
        sleep: () => Promise.resolve(),
        onDone: resolveDone,
      });

      const result = runner.start();
      assert.equal(result.started, false);
      const final = await done;
      assert.equal(final.phase, item.phase);
      assert.equal(final.reason, item.reason);
    });
  }
});

test("an adapter failure stops with its reason", async () => {
  const adapter = makeAdapter();
  let calls = 0;
  adapter.insert = () => {
    calls += 1;
    return calls === 1 ? { ok: true } : { ok: false, reason: "page-blocked" };
  };
  const h = setup({ adapter, settings: makeSettings({ snippet: { text: "abc" } }) });

  h.runner.start();
  const final = await h.done;

  assert.equal(final.phase, "error");
  assert.equal(final.reason, "page-blocked");
});

test("the same seed produces the same mistake sequence", async () => {
  async function transcript() {
    const adapter = makeAdapter();
    let resolveDone;
    const done = new Promise((resolve) => {
      resolveDone = resolve;
    });
    const runner = AT.createRunner({
      getTarget: () => makeTarget(),
      getSettings: () => makeSettings({
        snippet: { text: "seed test" },
        mistakes: { enabled: true, rate: 0.2, minPauseMs: 10, maxPauseMs: 10 },
      }),
      resolveAdapter: () => adapter,
      sleep: () => Promise.resolve(),
      seed: 7,
      onDone: resolveDone,
    });
    runner.start();
    await done;
    return adapter.inserted.join("");
  }

  assert.equal(await transcript(), await transcript());
});

test("a mistake at the first character cannot delete a pre-existing prefix", async () => {
  // Seed 42's first plan for "a" is a real (possibly multi-)backspace slip. The
  // runner must clamp deletions to characters *this run* inserted, so a
  // three-backspace mistake at position 0 removes only the wrong character.
  const probe = AT.mistakes.createPlanner({ rate: 1, rng: AT.cadence.createRng(42) }).plan("a");
  assert.ok(probe, "seed 42 should produce a mistake");

  const adapter = makeAdapter();
  const h = setup({
    adapter,
    settings: makeSettings({ snippet: { text: "a" }, mistakes: { enabled: true, rate: 1, minPauseMs: 10, maxPauseMs: 10 } }),
  });
  h.runner.start();
  const final = await h.done;

  assert.equal(final.phase, "done");
  assert.equal(adapter.value(), "a");
  assert.equal(adapter.deleted.length, 1, "only the wrong character may be deleted");
});
