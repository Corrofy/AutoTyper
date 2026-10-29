#!/usr/bin/env node
/**
 * tools/check-syntax.mjs — fast static gate used before every build.
 *
 * There is no bundler to catch mistakes, so this parses every shipped script with
 * Node's parser, validates every JSON file, and verifies that the manifest's
 * script list matches the order the code actually requires.
 */

import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = [...(await walk(join(ROOT, "src"))), ...(await walk(join(ROOT, "test"))), join(ROOT, "build.mjs")];
const problems = [];

for (const file of files) {
  const ext = extname(file);
  if (ext === ".json") {
    try {
      JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      problems.push(`${relative(ROOT, file)}: invalid JSON — ${err.message}`);
    }
    continue;
  }
  if (ext !== ".js" && ext !== ".mjs") continue;

  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    problems.push(`${relative(ROOT, file)}: ${(result.stderr || "").trim().split("\n").slice(0, 3).join(" | ")}`);
  }
}

// Load-order contract: the manifest's content script list is the runtime truth.
const manifest = JSON.parse(await readFile(join(ROOT, "src/manifest.base.json"), "utf8"));
const declared = manifest.content_scripts?.[0]?.js ?? [];
const expected = [
  "shared/protocol.js",
  "background/settings.js",
  "content/engine/cadence.js",
  "content/engine/mistakes.js",
  "content/engine/keycode-map.js",
  "content/hotkeys.js",
  "content/injection/dispatcher.js",
  "content/injection/adapters/textarea.js",
  "content/injection/detect.js",
  "content/engine/runner.js",
  "content/focus-tracker.js",
  "content/overlay/overlay.js",
  "content/content.js",
];
if (declared.join() !== expected.join()) {
  problems.push(`manifest content script order differs from the documented order:\n    got:      ${declared.join(", ")}\n    expected: ${expected.join(", ")}`);
}

for (const ref of declared) {
  try {
    await readFile(join(ROOT, "src", ref));
  } catch {
    problems.push(`manifest references a missing file: ${ref}`);
  }
}

if (problems.length) {
  console.error(`check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`check ok — ${files.length} files parsed, manifest order verified`);
