/**
 * Capture classroom-themed call chrome states (PC + mobile).
 * Uses /dev/call-chrome?scene=… (development fixture, no admin auth).
 *
 * Usage: COMPARE_BASE_URL=http://127.0.0.1:3000 node scripts/capture-call-theme.mjs
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs/theme-call-compare");
const BASE = process.env.COMPARE_BASE_URL || "http://127.0.0.1:3000";

const SCENES = [
  ["prep", "01-prep"],
  ["mic_denied", "02-mic-denied"],
  ["mic_preparing", "03-mic-preparing"],
  ["listen_only", "04-listen-only"],
  ["connecting", "05-connecting"],
  ["reconnecting", "06-reconnecting"],
  ["solo", "07-solo"],
  ["multi", "08-multi"],
  ["empty_seats", "09-empty-seats"],
  ["connection_error", "10-connection-error"],
  ["stuck", "11-stuck"],
  ["toast", "12-toast"],
];

async function waitForServer(url, ms = 90_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server not ready: ${url}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await waitForServer(BASE);

  const browser = await chromium.launch();

  for (const [viewportName, opts] of [
    ["pc", { viewport: { width: 1280, height: 900 } }],
    ["mobile", { ...devices["iPhone 13"] }],
  ]) {
    const context = await browser.newContext(opts);
    const page = await context.newPage();

    for (const [scene, prefix] of SCENES) {
      const qs = new URLSearchParams({ scene });
      if (scene === "stuck") qs.set("debugVoice", "1");
      const url = `${BASE}/dev/call-chrome?${qs.toString()}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(".cm-call-root", { timeout: 30_000 });
      await page.waitForTimeout(700);
      const file = `${prefix}-${viewportName}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      console.log("wrote", file);
    }

    await context.close();
  }

  await browser.close();
  console.log("call theme shots ok →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
