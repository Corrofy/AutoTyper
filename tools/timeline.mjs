#!/usr/bin/env node
/**
 * tools/timeline.mjs — print the cadence as numbers.
 *
 * M1 is pure functions with no browser, which is only useful if you can see what
 * they produce. This prints one row per keystroke (delay, reason, cumulative
 * time) plus a distribution summary, using the same `cadence.js` the extension
 * ships. Nothing here is a simulation of the sampler — it *is* the sampler.
 *
 * Usage:
 *   node tools/timeline.mjs
 *   node tools/timeline.mjs --wpm 48 --chars 60 --seed 7
 *   node tools/timeline.mjs --text "const x = 1;" --seed 1
 *   node tools/timeline.mjs --no-pause --no-burst     # plain Gaussian only
 *
 * Why a seed: the output must be reproducible when you compare two runs (for
 * example, before and after changing a pause rule). Without it every run differs
 * and "does this look more human?" becomes guesswork.
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

require(join(ROOT, "src", "content", "engine", "cadence.js"));
const { cadence } = globalThis.AutoTyper;

const SAMPLE = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i += 1) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}
const answer = twoSum([2, 7, 11, 15], 9);`;

const HELP = `Auto Typer cadence timeline

  --wpm <n>        target speed (UI range 30–50, default 40)
  --chars <n>      how many characters to sample (default 120)
  --text <s>       sample this exact text instead of the built-in snippet
  --seed <n>       RNG seed, for reproducible runs (default 42)
  --no-pause       disable word/symbol/newline beats
  --no-burst       disable fast runs
  -h, --help       show this help
`;

function parseArgs(argv) {
  const options = { wpm: 40, chars: 120, charsExplicit: false, text: null, seed: 42, pauses: true, burst: true };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--no-pause") {
      options.pauses = false;
      continue;
    }
    if (arg === "--no-burst") {
      options.burst = false;
      continue;
    }

    const [flag, inline] = arg.split("=");
    const read = () => {
      if (inline !== undefined) return inline;
      index += 1;
      return argv[index];
    };

    switch (flag) {
      case "--wpm":
        options.wpm = Number(read());
        break;
      case "--chars":
        options.chars = Number(read());
        options.charsExplicit = true;
        break;
      case "--text": {
        const value = read();
        if (value === undefined) throw new Error("--text needs a value");
        options.text = value;
        break;
      }
      case "--seed":
        options.seed = Number(read());
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.wpm) || options.wpm <= 0) throw new Error("--wpm must be a positive number");
  if (!Number.isInteger(options.chars) || options.chars < 1) throw new Error("--chars must be a positive integer");
  if (!Number.isFinite(options.seed)) throw new Error("--seed must be a number");

  return options;
}

function buildText(options) {
  if (options.text !== null) {
    return options.charsExplicit ? options.text.slice(0, options.chars) : options.text;
  }
  let text = SAMPLE;
  while (text.length < options.chars) text += `\n${SAMPLE}`;
  return text.slice(0, options.chars);
}

function visible(char) {
  if (char === "\n") return "\\n";
  if (char === "\t") return "\\t";
  if (char === " ") return "·";
  return char;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values, average) {
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatSeconds(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds % 60).toFixed(0)}s`;
}

function printHistogram(delays) {
  const width = 100;
  const buckets = new Map();
  for (const delay of delays) {
    const start = Math.floor(delay / width) * width;
    buckets.set(start, (buckets.get(start) || 0) + 1);
  }

  const starts = [...buckets.keys()].sort((a, b) => a - b);
  const peak = Math.max(...buckets.values());
  const scale = peak > 36 ? 36 / peak : 1;

  console.log(`\n  Delay histogram (${width} ms buckets)`);
  for (const start of starts) {
    const count = buckets.get(start);
    const bar = "█".repeat(Math.max(1, Math.round(count * scale)));
    console.log(`    ${String(start).padStart(4)}–${String(start + width - 1).padEnd(4)} ${bar} ${count}`);
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`timeline: ${error.message}\n`);
    console.error(HELP);
    process.exit(2);
  }

  if (options.help) {
    console.log(HELP);
    return;
  }

  const text = buildText(options);
  const meanMs = cadence.wpmToMeanMs(options.wpm);
  const sampler = cadence.createSampler({
    wpm: options.wpm,
    jitterEnabled: true,
    sigma: 0.25,
    minFactor: 0.5,
    maxFactor: 2,
    burstChance: options.burst ? undefined : 0,
    pauses: options.pauses ? {} : { word: false, symbol: false, newline: false },
    rng: cadence.createRng(options.seed),
  });

  const rows = [];
  let elapsed = 0;
  let previous = "";
  for (const char of text) {
    const sample = sampler.next(previous);
    elapsed += sample.delayMs;
    rows.push({ char, after: previous, delay: sample.delayMs, reason: sample.reason, elapsed });
    previous = char;
  }

  console.log("Auto Typer cadence");
  console.log(`  speed   ${options.wpm} WPM → μ ${meanMs.toFixed(1)} ms/char (${cadence.wpmToCps(options.wpm).toFixed(2)} cps)`);
  console.log(`  seed    ${options.seed}`);
  console.log(`  model   pauses ${options.pauses ? "on" : "off"}, bursts ${options.burst ? "on" : "off"}`);
  console.log(`  text    ${rows.length} chars\n`);

  console.log("    #  char   after   delay      at  reason");
  for (const [index, row] of rows.entries()) {
    const char = `'${visible(row.char)}'`.padEnd(6);
    const after = row.after ? `'${visible(row.after)}'`.padEnd(6) : "—".padEnd(6);
    const delay = `${row.delay}ms`.padStart(6);
    const at = formatSeconds(row.elapsed).padStart(7);
    console.log(`  ${String(index).padStart(3)}  ${char} ${after} ${delay}  ${at}  ${row.reason}`);
  }

  const delays = rows.map((row) => row.delay);
  const average = mean(delays);
  const sd = stdev(delays, average);
  const total = delays.reduce((sum, value) => sum + value, 0);

  const counts = rows.reduce((map, row) => map.set(row.reason, (map.get(row.reason) || 0) + 1), new Map());

  console.log("\n  Summary");
  console.log(`    mean   ${average.toFixed(1)} ms   (target ${meanMs.toFixed(1)})`);
  console.log(`    sd     ${sd.toFixed(1)} ms`);
  console.log(`    range  ${Math.min(...delays)}–${Math.max(...delays)} ms`);
  console.log(`    total  ${formatSeconds(total)}`);
  console.log(
    `    kinds  ${[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason} ${count}`)
      .join(" · ")}`,
  );

  printHistogram(delays);

  if (options.wpm < 30 || options.wpm > 50) {
    console.log(`\n  note: the UI clamps speed to 30–50 WPM; ${options.wpm} is only reachable from code.`);
  }
}

main();
