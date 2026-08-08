/**
 * Capture classroom-themed profile/settings chrome (PC + mobile).
 * Uses /dev/profile-chrome and /dev/settings-chrome (dev fixtures).
 *
 * Usage: COMPARE_BASE_URL=http://127.0.0.1:3000 node scripts/capture-account-theme.mjs
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs/theme-account-compare");
const BASE = process.env.COMPARE_BASE_URL || "http://127.0.0.1:3000";

const PROFILE_SCENES = [
  ["filled", "p01-filled"],
  ["empty", "p02-empty"],
  ["validation", "p03-validation"],
  ["saving", "p04-saving"],
  ["success", "p05-success"],
  ["error", "p06-error"],
  ["minor", "p07-minor"],
  ["legal", "p08-legal"],
];

const SETTINGS_SCENES = [
  ["default", "s01-default"],
  ["loading", "s02-loading"],
  ["error", "s03-error"],
  ["unlinked", "s04-unlinked"],
  ["linked", "s05-linked"],
  ["notify_default", "s06-notify-default"],
  ["notify_granted", "s07-notify-granted"],
  ["notify_denied", "s08-notify-denied"],
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

    for (const [scene, prefix] of PROFILE_SCENES) {
      const url = `${BASE}/dev/profile-chrome?scene=${scene}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(".cm-profile-root", { timeout: 30_000 });
      await page.waitForTimeout(500);
      const file = `${prefix}-${viewportName}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      console.log("wrote", file);
    }

    for (const [scene, prefix] of SETTINGS_SCENES) {
      const url = `${BASE}/dev/settings-chrome?scene=${scene}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(".cm-settings-root", { timeout: 30_000 });
      await page.waitForTimeout(500);
      const file = `${prefix}-${viewportName}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      console.log("wrote", file);
    }

    await context.close();
  }

  await browser.close();
  console.log("account theme shots ok →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
