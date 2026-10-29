#!/usr/bin/env node
/**
 * tools/e2e.mjs — automated acceptance run against a real browser.
 *
 * How it works:
 *   1. rebuilds dist/<target>
 *   2. serves test/fixture on 127.0.0.1
 *   3. launches the browser with the extension installed via `web-ext run`
 *   4. opens the fixture with ?probe=1; the page-side probe (test/fixture/probe.js)
 *      drives the widget with synthetic pointer events and POSTs what it observed
 *   5. asserts in Node, prints a checklist, exits non-zero on failure
 *
 * Why not Playwright/Selenium: `web-ext` is the tool the browsers themselves
 * document for temporary installs, it needs no extra driver, and the assertions we
 * care about are DOM-level and can be made from inside the page.
 *
 * Usage:
 *   node tools/e2e.mjs                 # Firefox (default; must be installed)
 *   node tools/e2e.mjs --chromium      # Chromium via --chromium-binary
 *   E2E_PAGE=typing.html node tools/e2e.mjs   # M2 typing acceptance (dev build)
 *   E2E_DEV=1 E2E_PAGE=typing.html node tools/e2e.mjs
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/\/tools$/, "");
const FIXTURES = join(ROOT, "test", "fixture");
const USE_CHROMIUM = process.argv.includes("--chromium");
const TARGET = USE_CHROMIUM ? "chromium" : "firefox";
const PAGE = process.env.E2E_PAGE || "smoke.html";
// Only the typing fixture needs the dev-only bridge. The smoke page keeps
// exercising a production build, so a seam accidentally shipped without --dev
// would still be visible here.
const DEV = process.env.E2E_DEV === "1" || PAGE === "typing.html";
const REPORT_TIMEOUT_MS = PAGE === "typing.html" ? 120000 : 60000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function startServer() {
  let report = null;
  let onReport = null;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (url.pathname === "/report") {
      if (req.method === "POST") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        try {
          report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch (err) {
          report = { checks: { pageErrors: [`unparseable report: ${err.message}`] } };
        }
        res.writeHead(204).end();
        onReport?.(report);
        return;
      }
      res.writeHead(report ? 200 : 204, { "content-type": "application/json" });
      res.end(report ? JSON.stringify(report) : "");
      return;
    }

    // Static file serving, confined to the fixture directory.
    const requested = normalize(join(FIXTURES, decodeURIComponent(url.pathname)));
    if (!requested.startsWith(FIXTURES + sep) && requested !== FIXTURES) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(requested);
      res.writeHead(200, { "content-type": MIME[extname(requested)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        port,
        waitForReport(timeoutMs) {
          if (report) return Promise.resolve(report);
          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              onReport = null;
              resolve(null);
            }, timeoutMs);
            onReport = (value) => {
              onReport = null;
              clearTimeout(timer);
              resolve(value);
            };
          });
        },
        close: () => server.close(),
      });
    });
  });
}

function build() {
  const args = ["build.mjs", "--no-zip"];
  if (DEV) args.push("--dev");
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) throw new Error("build failed");
}

function launchBrowser(url) {
  const args = [
    "--yes",
    "web-ext@8",
    "run",
    "--source-dir",
    join(ROOT, "dist", TARGET),
    "--no-reload",
    "--no-input",
    "--start-url",
    url,
  ];

  if (process.env.E2E_VERBOSE === "1") args.push("--verbose");

  if (USE_CHROMIUM) {
    args.push("--target", "chromium");
    if (process.env.CHROMIUM_BINARY) args.push("--chromium-binary", process.env.CHROMIUM_BINARY);
  } else {
    args.push("--firefox", process.env.FIREFOX_BINARY || "firefox", "--args=-headless");
  }

  const child = spawn("npx", args, { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const state = { output: "", installed: false };

  child.stdout.on("data", (chunk) => {
    state.output += chunk.toString();
    if (/Installed .* as a temporary add-on/.test(state.output)) state.installed = true;
  });
  child.stderr.on("data", (chunk) => {
    state.output += chunk.toString();
  });

  return { child, state };
}

function stop(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  const hard = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }, 3000);
  hard.unref();
}

function assertAndReport(checks) {
  const smokeChecks = [
    ["overlay mounted in the page", checks.overlayMounted === true],
    ["shadow root + panel rendered", checks.shadowRoot === true && checks.panel === true],
    ["content script boot marker", checks.bootMarker === "ok"],
    ["background reachable from content", checks.backgroundMarker === "ok"],
    ["widget shows live speed", Boolean(checks.speedText && /WPM/.test(checks.speedText))],
    ["clicking widget does not steal focus", checks.focusRetained === true],
    ["drag moves the widget", checks.dragMoved === true],
    ["enable round-trip reaches storage", Boolean(checks.phaseAfterEnable) && checks.phaseAfterEnable !== "disabled"],
    ["collapse round-trip persists", checks.collapsed === true],
    ["no page-level errors", Array.isArray(checks.pageErrors) && checks.pageErrors.length === 0],
  ];

  const typingChecks = typingAssertions(checks);
  const checksList = checks.probe === "typing" ? typingChecks : smokeChecks;

  let failed = 0;
  console.log(`\nAcceptance — ${TARGET} / ${PAGE}${DEV ? " (dev build)" : ""}`);
  for (const [label, ok] of checksList) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failed += 1;
  }

  console.log("\nObserved:");
  console.log(
    JSON.stringify(
      checks.probe === "typing"
        ? {
            bridgeReady: checks.bridgeReady,
            bridgeMarker: checks.bridgeMarker,
            overlayMounted: checks.overlayMounted,
            runs: checks.runs,
            order: checks.order,
            legacy: checks.legacy,
            untrusted: checks.untrusted,
            pageErrors: checks.pageErrors,
          }
        : {
            phaseBeforeEnable: checks.phaseBeforeEnable,
            phaseAfterEnable: checks.phaseAfterEnable,
            speedText: checks.speedText,
            transformBefore: checks.transformBefore,
            transformAfter: checks.transformAfter,
            pageErrors: checks.pageErrors,
          },
      null,
      2,
    ),
  );

  return failed;
}

/**
 * M2 acceptance. Values are compared exactly: the whole point of the engine is
 * that the field ends up with the snippet, not approximately the snippet.
 */
function typingAssertions(checks) {
  const runs = checks.runs || {};
  const clean = (container) =>
    Boolean(container) && container.failures.length === 0 && container.checked > 0;

  return [
    ["dev bridge answered ping", checks.bridgeReady === true],
    ["overlay Start enabled once a field is focused", checks.overlayStartEnabled === true],
    [
      "plain textarea typed from the overlay button",
      Boolean(runs.plain) && runs.plain.value === "hello world" && runs.plain.phase === "done",
    ],
    ["overlay reports the run as done", Boolean(runs.plain) && runs.plain.detail === "Done"],
    [
      "React-controlled textarea received the text",
      Boolean(runs.controlled) && runs.controlled.value === "react" && runs.controlled.phase === "done",
    ],
    [
      "React onChange fired once per character",
      Boolean(runs.controlled) && runs.controlled.onChange === 5,
    ],
    [
      "single-line input skips the newline",
      Boolean(runs.single) &&
        runs.single.value === "onetwo" &&
        runs.single.skipped === 1 &&
        runs.single.total === 6,
    ],
    [
      "mistake run ends with the exact text",
      Boolean(runs.mistakes) && runs.mistakes.value === "brown fox jumps" && runs.mistakes.phase === "done",
    ],
    [
      "mistake run actually typed a wrong key and corrected it",
      Boolean(runs.mistakes) && runs.mistakes.corrections > 0,
    ],
    [
      "stop mid-run leaves only a prefix",
      Boolean(runs.stop) &&
        runs.stop.phase === "stopped" &&
        runs.stop.prefixOfSnippet === true &&
        runs.stop.typed > 0 &&
        runs.stop.typed < 17,
    ],
    ["keystroke order is keydown → … → keyup", clean(checks.order)],
    ["legacy keyCode/which/charCode are coherent", clean(checks.legacy)],
    ["synthetic keystrokes stayed untrusted", clean(checks.untrusted)],
    ["no page-level errors", Array.isArray(checks.pageErrors) && checks.pageErrors.length === 0],
  ];
}

async function main() {
  build();
  const server = await startServer();
  const url = `http://127.0.0.1:${server.port}/${PAGE}?probe=1`;
  console.log(`\nLaunching ${TARGET} at ${url}`);

  const { child, state } = launchBrowser(url);
  let exitCode = 1;

  try {
    const report = await server.waitForReport(REPORT_TIMEOUT_MS);
    if (!report) {
      console.error("\nNo probe report received. Browser output:\n");
      console.error(state.output.split("\n").slice(-25).join("\n"));
      exitCode = 1;
    } else {
      const failed = assertAndReport(report.checks || {});
      exitCode = failed > 0 ? 1 : 0;
      if (failed > 0) {
        console.log("\nBrowser output (tail):\n");
        console.log(state.output.split("\n").slice(-80).join("\n"));
      }
      if (!state.installed) {
        console.log("\nnote: could not confirm the temporary install banner in web-ext output");
      }
    }
  } finally {
    stop(child);
    server.close();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`e2e failed: ${err.message}`);
  process.exit(1);
});
