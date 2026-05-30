#!/usr/bin/env node
/**
 * Pre-launch test orchestrator.
 *
 * Usage:
 *   node scripts/run-prelaunch-tests.mjs
 *   node scripts/run-prelaunch-tests.mjs --api-base https://classmate-zeta-one.vercel.app
 *   node scripts/run-prelaunch-tests.mjs --skip-build --skip-playwright
 */
import { spawnSync } from "node:child_process";
import { parseArgs } from "./lib/prelaunch-test-utils.mjs";

const args = process.argv.slice(2);
const opts = parseArgs(args);
const skipBuild = args.includes("--skip-build");
const skipPlaywright = args.includes("--skip-playwright");

const apiArgs = opts.apiBase ? ["--api-base", opts.apiBase] : [];

function run(label, cmd, cmdArgs = []) {
  console.log(`\n${"=".repeat(72)}\n>>> ${label}\n${"=".repeat(72)}`);
  const result = spawnSync(cmd, cmdArgs, {
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

const results = [];

if (!skipBuild) {
  results.push({ label: "npm run build", code: run("build", "npm", ["run", "build"]) });
}

const nodeScripts = [
  ["probe-match-join-v3", "scripts/probe-match-join-v3.mjs"],
  ["e2e-concurrent-join", "scripts/e2e-concurrent-join.mjs"],
  ["e2e-recovery", "scripts/e2e-recovery.mjs"],
  ["e2e-zombie-stale", "scripts/e2e-zombie-stale.mjs"],
  ["e2e-growth", "scripts/e2e-growth.mjs"],
  ["e2e-entitlements", "scripts/e2e-entitlements.mjs"],
];

for (const [name, script] of nodeScripts) {
  results.push({
    label: name,
    code: run(name, "node", [script, ...apiArgs]),
  });
}

if (!skipPlaywright) {
  try {
    await import("playwright");
    results.push({
      label: "e2e-enter-room (playwright)",
      code: run("e2e-enter-room", "node", ["scripts/e2e-enter-room.mjs", ...apiArgs]),
    });
    results.push({
      label: "e2e-webrtc-call (playwright)",
      code: run("e2e-webrtc-call", "node", [
        "scripts/e2e-webrtc-call.mjs",
        ...apiArgs,
      ]),
    });
  } catch {
    console.log("\nSKIP: playwright not installed — run `npm i -D playwright` for UI E2E");
    results.push({ label: "e2e-enter-room", code: 0, skipped: true });
  }
}

console.log(`\n${"=".repeat(72)}\nPRELAUNCH TEST SUMMARY\n${"=".repeat(72)}`);
let failed = 0;
for (const r of results) {
  const status = r.skipped ? "SKIP" : r.code === 0 ? "PASS" : "FAIL";
  console.log(`${status.padEnd(5)} ${r.label}`);
  if (r.code !== 0 && !r.skipped) failed += 1;
}

console.log(`\nTotal failed suites: ${failed}`);
console.log("See docs/PRELAUNCH_E2E_REPORT.md for manual mobile/stripe/monitoring checklist.");

process.exit(failed > 0 ? 1 : 0);
