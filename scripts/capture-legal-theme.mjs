/**
 * Capture classroom-themed legal pages + consent chrome.
 * Legal bodies are captured from production routes (no text duplication).
 *
 * Usage: COMPARE_BASE_URL=http://127.0.0.1:3000 node scripts/capture-legal-theme.mjs
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs/theme-legal-compare");
const BASE = process.env.COMPARE_BASE_URL || "http://127.0.0.1:3000";

const LEGAL_PAGES = [
  ["/terms", "l01-terms"],
  ["/privacy", "l02-privacy"],
  ["/guidelines", "l03-guidelines"],
  ["/legal/commercial-disclosure", "l04-commercial"],
];

const CONSENT_SCENES = [
  ["needed", "c01-needed"],
  ["agreed", "c02-agreed"],
  ["disabled_save", "c03-disabled"],
  ["saving", "c04-saving"],
  ["success", "c05-success"],
  ["error", "c06-error"],
  ["loading", "c07-loading"],
  ["load_error", "c08-load-error"],
  ["minor", "c09-minor"],
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

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    throw new Error(
      `horizontal overflow on ${label}: ${overflow.scrollWidth} > ${overflow.clientWidth}`
    );
  }
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

    for (const [route, prefix] of LEGAL_PAGES) {
      await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForSelector(".cm-legal-doc", { timeout: 30_000 });
      await page.waitForTimeout(500);
      await assertNoHorizontalOverflow(page, `${prefix}-${viewportName}`);
      await page.screenshot({
        path: path.join(OUT, `${prefix}-${viewportName}.png`),
        fullPage: true,
      });
      console.log("wrote", `${prefix}-${viewportName}.png`);

      // bottom / footer focus shot
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(OUT, `${prefix}-footer-${viewportName}.png`),
        fullPage: false,
      });
      console.log("wrote", `${prefix}-footer-${viewportName}.png`);
    }

    // Privacy long-list / email URL area
    await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".cm-legal-doc");
    const email = page.locator('a[href^="mailto:classmate.app.team@gmail.com"]');
    if (await email.count()) {
      await email.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(OUT, `l02-privacy-email-${viewportName}.png`),
        fullPage: false,
      });
      console.log("wrote", `l02-privacy-email-${viewportName}.png`);
    }

    for (const [scene, prefix] of CONSENT_SCENES) {
      await page.goto(`${BASE}/dev/consent-chrome?scene=${scene}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForSelector(".cm-consent-root", { timeout: 30_000 });
      await page.waitForTimeout(400);
      await assertNoHorizontalOverflow(page, `${prefix}-${viewportName}`);
      await page.screenshot({
        path: path.join(OUT, `${prefix}-${viewportName}.png`),
        fullPage: true,
      });
      console.log("wrote", `${prefix}-${viewportName}.png`);
    }

    // a11y-ish focus shot on consent checkbox
    await page.goto(`${BASE}/dev/consent-chrome?scene=needed`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".cm-consent-check input");
    await page.focus(".cm-consent-check input");
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(OUT, `c10-focus-${viewportName}.png`),
      fullPage: true,
    });
    console.log("wrote", `c10-focus-${viewportName}.png`);

    // 200% zoom check (PC only)
    if (viewportName === "pc") {
      await page.goto(`${BASE}/terms`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".cm-legal-doc");
      await page.evaluate(() => {
        document.body.style.zoom = "2";
      });
      await page.waitForTimeout(300);
      await assertNoHorizontalOverflow(page, "terms-200pct");
      await page.screenshot({
        path: path.join(OUT, "l01-terms-200pct-pc.png"),
        fullPage: false,
      });
      console.log("wrote l01-terms-200pct-pc.png");
      await page.evaluate(() => {
        document.body.style.zoom = "";
      });
    }

    await context.close();
  }

  await browser.close();
  console.log("legal theme shots ok →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
