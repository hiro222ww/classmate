import { chromium } from "playwright";
import fs from "fs";
const OUT = "/opt/cursor/artifacts/prod-call-verify";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
for (const [name, url, vp] of [
  ["members-1", "http://127.0.0.1:3000/dev/call-chrome?scene=solo&members=1", {width:390,height:844}],
  ["members-2", "http://127.0.0.1:3000/dev/call-chrome?scene=multi&members=2", {width:390,height:844}],
  ["members-5", "http://127.0.0.1:3000/dev/call-chrome?scene=multi&members=5", {width:390,height:844}],
  ["reconnect", "http://127.0.0.1:3000/dev/call-chrome?scene=reconnecting&members=2", {width:390,height:844}],
  ["error", "http://127.0.0.1:3000/dev/call-chrome?scene=connection_error&members=2", {width:390,height:844}],
  ["pc-2", "http://127.0.0.1:3000/dev/call-chrome?scene=multi&members=2", {width:1280,height:900}],
]) {
  const page = await (await browser.newContext({ viewport: vp, locale: "ja-JP" })).newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator(".cm-room-session-hero").waitFor({ state: "visible" });
  const m = await page.evaluate(() => {
    const empties = [...document.querySelectorAll(".cm-room-avatar-chip-name")].filter(el => (el.textContent||"").trim()==="空席").length;
    const speaker = [...document.querySelectorAll(".cm-call-dock-label")].some(el => /スピーカー|消音/.test(el.textContent||""));
    const dockItems = [...document.querySelectorAll(".cm-call-dock-item .cm-call-dock-label")].map(el => (el.textContent||"").trim());
    const topSelect = document.querySelector("body > select, main select, .cm-call-root > div > select");
    const inlineMicSelect = !!document.querySelector(".cm-call-root select");
    const density = document.querySelector(".cm-room-avatar-strip-wrap")?.getAttribute("data-density");
    const status = document.querySelector(".cm-room-session-status")?.textContent?.trim() || null;
    const notices = [...document.querySelectorAll(".cm-call-notice")].map(el => el.textContent?.trim().slice(0,80));
    return { empties, speaker, dockItems, inlineMicSelect, density, status, notices, hasWrap: !!document.querySelector(".cm-room-avatar-strip-wrap"), invite: !!document.querySelector(".cm-room-avatar-invite") };
  });
  await page.locator(".cm-room-session-hero").screenshot({ path: `${OUT}/hero-${name}.png`, animations: "disabled" });
  await page.locator(".cm-call-dock").screenshot({ path: `${OUT}/dock-${name}.png`, animations: "disabled" }).catch(()=>{});
  await page.screenshot({ path: `${OUT}/full-${name}.png`, animations: "disabled" });
  results.push({ name, ...m });
  console.log(JSON.stringify({ name, ...m }));
  await page.close();
}
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(results, null, 2));
await browser.close();
const bad = results.filter(r => r.empties>0 || r.speaker || !r.hasWrap || !r.invite || r.dockItems.includes("スピーカー"));
console.log("failures", bad.length);
process.exit(bad.length ? 1 : 0);
