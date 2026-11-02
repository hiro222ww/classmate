import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts/hero-avatar-strip";
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "phone-390", width: 390, height: 844 },
  { name: "ipad-768", width: 768, height: 1024 },
  { name: "pc-1280", width: 1280, height: 900 },
];
const COUNTS = [1, 2, 3, 4, 5, 8];

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const vp of VIEWPORTS) {
    for (const count of COUNTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        locale: "ja-JP",
      });
      const page = await context.newPage();
      await page.goto(
        `${BASE}/dev/call-chrome?scene=multi&members=${count}`,
        { waitUntil: "networkidle" }
      );
      await page.locator(".cm-room-session-hero").waitFor({ state: "visible" });
      await page.waitForTimeout(250);

      const metrics = await page.evaluate(() => {
        const wrap = document.querySelector(".cm-room-avatar-strip-wrap");
        const chips = [...document.querySelectorAll(".cm-room-avatar-chip")];
        const empties = document.querySelectorAll(
          ".cm-room-avatar-chip--empty, .cm-room-avatar-chip-name"
        );
        const emptyLabels = [...document.querySelectorAll(".cm-room-avatar-chip-name")]
          .filter((el) => (el.textContent || "").trim() === "空席").length;
        const invite = document.querySelector(".cm-room-avatar-invite");
        const faces = [...document.querySelectorAll(".cm-room-avatar-chip-face")];
        const faceSizes = faces.map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        const hero = document.querySelector(".cm-room-session-hero")?.getBoundingClientRect();
        const inviteBox = invite?.getBoundingClientRect();
        return {
          density: wrap?.getAttribute("data-density") || null,
          memberCountAttr: wrap?.getAttribute("data-member-count") || null,
          chipCount: chips.length,
          emptyLabels,
          invitePresent: Boolean(invite),
          inviteDisabled: invite ? invite.disabled : null,
          faceSizes,
          overflowChip: Boolean(document.querySelector(".cm-room-avatar-chip--overflow")),
          inviteRight: inviteBox && hero ? Math.round(hero.right - inviteBox.right) : null,
          inviteBottom: inviteBox && hero ? Math.round(hero.bottom - inviteBox.bottom) : null,
          noPageHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });

      const shotName = `hero-${vp.name}-members-${count}.png`;
      await page.locator(".cm-room-session-hero").screenshot({
        path: path.join(OUT, shotName),
        animations: "disabled",
      });

      const row = { viewport: vp.name, members: count, ...metrics, shot: shotName };
      results.push(row);
      console.log(JSON.stringify(row));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2));
const bad = results.filter(
  (r) =>
    r.emptyLabels > 0 ||
    !r.invitePresent ||
    !r.noPageHScroll ||
    (r.members <= 5 && r.overflowChip) ||
    (r.members === 2 && r.density !== "lg") ||
    (r.members === 5 && r.density !== "sm")
);
console.log("failures", bad.length);
process.exit(bad.length ? 1 : 0);
