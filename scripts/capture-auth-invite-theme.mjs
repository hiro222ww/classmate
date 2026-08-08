/**
 * Capture classroom-themed auth + invite chrome (PC + mobile).
 * Uses /dev/auth-chrome and /dev/invite-chrome.
 *
 * Usage: COMPARE_BASE_URL=http://127.0.0.1:3000 node scripts/capture-auth-invite-theme.mjs
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs/theme-auth-invite-compare");
const BASE = process.env.COMPARE_BASE_URL || "http://127.0.0.1:3000";

const AUTH_SCENES = [
  ["login", "a01-login"],
  ["google", "a02-google"],
  ["busy", "a03-busy"],
  ["error", "a04-error"],
  ["callback", "a05-callback"],
  ["callback_error", "a06-callback-error"],
  ["restore", "a07-restore"],
  ["login_required", "a08-login-required"],
  ["auth_loading", "a09-auth-loading"],
];

const INVITE_SCENES = [
  ["invite_link", "i01-invite-link"],
  ["account", "i02-account"],
  ["joining", "i03-joining"],
  ["opening", "i04-opening"],
  ["slow", "i05-slow"],
  ["retry", "i06-retry"],
  ["expired_invite", "i07-expired"],
  ["invalid_invite", "i08-invalid"],
  ["class_full", "i09-full"],
  ["age_restricted", "i10-age"],
  ["needs_profile", "i11-profile"],
  ["restore_login", "i12-restore"],
  ["reregister_device", "i13-reregister"],
  ["server_error", "i14-server"],
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

    for (const [scene, prefix] of AUTH_SCENES) {
      await page.goto(`${BASE}/dev/auth-chrome?scene=${scene}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForSelector(".cm-auth-root", { timeout: 30_000 });
      await page.waitForTimeout(500);
      const file = `${prefix}-${viewportName}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      console.log("wrote", file);
    }

    for (const [scene, prefix] of INVITE_SCENES) {
      await page.goto(`${BASE}/dev/invite-chrome?scene=${scene}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForSelector(".cm-invite-progress", { timeout: 30_000 });
      await page.waitForTimeout(500);
      const file = `${prefix}-${viewportName}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      console.log("wrote", file);
    }

    await context.close();
  }

  await browser.close();
  console.log("auth/invite theme shots ok →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
