import { chromium } from "@playwright/test";

const base = process.env.PROBE_BASE || "http://127.0.0.1:3041";
const widths = [375, 390, 393, 430];
const paths = ["/", "/login", "/class/select", "/profile", "/settings", "/terms"];
const browser = await chromium.launch();
let failed = 0;
for (const w of widths) {
  for (const path of paths) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(base + path, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => {
      const clientW = document.documentElement.clientWidth;
      const scrollW = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      );
      const offenders = [];
      for (const el of document.body.querySelectorAll("*")) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const cs = getComputedStyle(el);
        if (
          cs.visibility === "hidden" ||
          cs.display === "none" ||
          Number(cs.opacity) === 0
        ) {
          continue;
        }
        if (rect.right > clientW + 1 || rect.left < -1) {
          offenders.push({
            score: Math.max(rect.right - clientW, -rect.left),
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || "").slice(0, 100),
            right: Math.round(rect.right),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
          });
        }
      }
      offenders.sort((a, b) => b.score - a.score);
      return {
        clientW,
        scrollW,
        overflowX: scrollW - clientW,
        top: offenders.slice(0, 8),
      };
    });
    const bad = info.overflowX > 1 || info.top.some((t) => t.score > 2);
    if (bad) failed += 1;
    console.log(
      JSON.stringify({
        w,
        path,
        bad,
        overflowX: info.overflowX,
        top: info.top.slice(0, 5),
      })
    );
    await ctx.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
