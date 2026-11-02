import { chromium } from "playwright";
import fs from "fs";
const OUT = "/opt/cursor/artifacts";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
for (const vp of [
  { name: "phone-390", width: 390, height: 844 },
  { name: "pc-1280", width: 1280, height: 900 },
]) {
  const page = await (await browser.newContext({ viewport: vp })).newPage();
  await page.goto("http://127.0.0.1:3000/dev/call-chrome?scene=multi&members=2", { waitUntil: "networkidle" });
  await page.locator(".cm-call-dock").waitFor({ state: "visible" });
  const metrics = await page.evaluate(() => {
    const dock = document.querySelector(".cm-call-dock");
    const items = [...document.querySelectorAll(".cm-call-dock-item")].map((el) => ({
      label: (el.querySelector(".cm-call-dock-label")?.textContent || "").trim(),
      disabled: el.disabled,
    }));
    const speaker = items.some((i) => /スピーカー|消音/.test(i.label));
    const box = dock?.getBoundingClientRect();
    return {
      itemCount: items.length,
      items,
      speaker,
      dockWidth: box ? Math.round(box.width) : null,
      columns: getComputedStyle(dock).gridTemplateColumns,
    };
  });
  console.log(vp.name, JSON.stringify(metrics));
  await page.locator(".cm-call-dock").screenshot({ path: `${OUT}/call-dock-${vp.name}.png`, animations: "disabled" });
  await page.screenshot({ path: `${OUT}/call-room-${vp.name}.png`, animations: "disabled" });
  await page.close();
}
await browser.close();
