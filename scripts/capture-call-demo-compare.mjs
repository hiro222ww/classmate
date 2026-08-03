/**
 * Capture PC/mobile screenshots of production CallRoomView chrome vs /call/demo.
 * Requires ADMIN_PASSWORD in env (.env.local) and a running next server, or
 * starts one via `next start` after build.
 *
 * Usage: node scripts/capture-call-demo-compare.mjs
 */
import { chromium, devices } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs/call-demo-compare");
const BASE = process.env.COMPARE_BASE_URL || "http://127.0.0.1:3010";

async function loadAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD.trim();
  try {
    const env = await readFile(path.join(ROOT, ".env.local"), "utf8");
    const line = env.split("\n").find((l) => l.startsWith("ADMIN_PASSWORD="));
    if (!line) return "";
    return line.slice("ADMIN_PASSWORD=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    return "";
  }
}

async function waitForServer(url, ms = 60_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server not ready: ${url}`);
}

async function main() {
  const password = await loadAdminPassword();
  if (!password) {
    throw new Error("ADMIN_PASSWORD missing");
  }

  await mkdir(OUT, { recursive: true });

  let child = null;
  const shouldStart = process.env.COMPARE_SKIP_SERVER !== "1";
  if (shouldStart) {
    child = spawn("npx", ["next", "start", "-p", "3010"], {
      cwd: ROOT,
      stdio: "ignore",
      env: { ...process.env },
    });
  }

  try {
    await waitForServer(BASE);

    const browser = await chromium.launch();
    const login = async (context) => {
      const page = await context.newPage();
      await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
      // Prefer API login for reliability
      const res = await page.request.post(`${BASE}/api/admin/login`, {
        data: { password },
      });
      if (!res.ok()) {
        throw new Error(`admin login failed: ${res.status()}`);
      }
      await page.close();
    };

    // PC
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      await login(context);
      const prod = await context.newPage();
      await prod.goto(`${BASE}/call/demo/prod-chrome`, {
        waitUntil: "networkidle",
      });
      await prod.waitForTimeout(800);
      await prod.screenshot({
        path: path.join(OUT, "01-pc-prod-chrome.png"),
        fullPage: true,
      });

      const demo = await context.newPage();
      await demo.addInitScript(() => {
        localStorage.setItem(
          "classmate_call_demo_v1",
          JSON.stringify({
            version: 1,
            memberCount: 3,
            filmingMode: true,
            showDemoBadge: false,
            autoSpeak: false,
            board: {
              className: "放課後クラス",
              boardTitle: "今日のテーマ",
              boardBody: "最近ハマっていること",
              conversationTheme: "雑談",
              classroomTheme: "放課後",
              backgroundTheme: "default",
              statusText: "通話中",
              showBoard: true,
            },
          })
        );
      });
      await demo.goto(`${BASE}/call/demo`, { waitUntil: "networkidle" });
      await demo.waitForTimeout(800);
      // Force filming mode without toggling (D would flip if already on).
      await demo.evaluate(() => {
        const key = "classmate_call_demo_v1";
        const raw = localStorage.getItem(key);
        const state = raw ? JSON.parse(raw) : {};
        state.filmingMode = true;
        state.showDemoBadge = false;
        localStorage.setItem(key, JSON.stringify(state));
      });
      await demo.reload({ waitUntil: "networkidle" });
      await demo.waitForTimeout(600);
      await demo.screenshot({
        path: path.join(OUT, "02-pc-demo.png"),
        fullPage: true,
      });
      await context.close();
    }

    // Mobile
    {
      const iPhone = devices["iPhone 13"];
      const context = await browser.newContext({
        ...iPhone,
      });
      await login(context);
      const prod = await context.newPage();
      await prod.goto(`${BASE}/call/demo/prod-chrome`, {
        waitUntil: "networkidle",
      });
      await prod.waitForTimeout(800);
      await prod.screenshot({
        path: path.join(OUT, "03-mobile-prod-chrome.png"),
        fullPage: true,
      });

      const demo = await context.newPage();
      await demo.addInitScript(() => {
        localStorage.setItem(
          "classmate_call_demo_v1",
          JSON.stringify({
            version: 1,
            memberCount: 3,
            filmingMode: true,
            showDemoBadge: false,
            autoSpeak: false,
            board: {
              className: "放課後クラス",
              boardTitle: "今日のテーマ",
              boardBody: "最近ハマっていること",
              conversationTheme: "雑談",
              classroomTheme: "放課後",
              backgroundTheme: "default",
              statusText: "通話中",
              showBoard: true,
            },
          })
        );
      });
      await demo.goto(`${BASE}/call/demo`, { waitUntil: "networkidle" });
      await demo.waitForTimeout(800);
      await demo.screenshot({
        path: path.join(OUT, "04-mobile-demo.png"),
        fullPage: true,
      });
      await context.close();
    }

    await browser.close();
    console.log(`screenshots written to ${OUT}`);
  } finally {
    if (child) child.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
