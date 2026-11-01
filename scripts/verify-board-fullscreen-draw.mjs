/**
 * Verify fullscreen fill + normal height stability + corner drawing.
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/verify-board-fullscreen-draw.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
fs.mkdirSync(OUT, { recursive: true });

async function measure(page) {
  return page.evaluate(() => {
    const surface = document.querySelector(".classmate-board-surface");
    const canvas = document.querySelector(".classmate-board-canvas");
    const toolbar = document.querySelector(".cm-board-toolbar");
    const scroll = document.querySelector(".classmate-board-scroll");
    const layer = document.querySelector(".classmate-board-fullscreen-layer");
    const sr = surface?.getBoundingClientRect();
    const cr = canvas?.getBoundingClientRect();
    const tr = toolbar?.getBoundingClientRect();
    const sc = scroll?.getBoundingClientRect();
    return {
      fullscreen: Boolean(layer),
      surface: sr
        ? { w: Math.round(sr.width), h: Math.round(sr.height), top: Math.round(sr.top), left: Math.round(sr.left) }
        : null,
      canvas: cr
        ? {
            w: Math.round(cr.width),
            h: Math.round(cr.height),
            top: Math.round(cr.top),
            left: Math.round(cr.left),
            bufW: canvas.width,
            bufH: canvas.height,
            drawBound: canvas.dataset.drawBound || null,
          }
        : null,
      scroll: sc
        ? { w: Math.round(sc.width), h: Math.round(sc.height) }
        : null,
      toolbarH: tr ? Math.round(tr.height) : null,
      surfaceH: surface ? Math.round(surface.getBoundingClientRect().height) : null,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
}

async function sampleInk(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".classmate-board-canvas");
    if (!canvas) return { ink: 0 };
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ink: 0 };
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 200 && r > 180 && g > 180 && b > 180) ink++;
    }
    return { ink, w: canvas.width, h: canvas.height };
  });
}

async function strokeAt(page, fx, fy, tx, ty) {
  const box = await page.locator(".classmate-board-canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  const x0 = box.x + box.width * fx;
  const y0 = box.y + box.height * fy;
  const x1 = box.x + box.width * tx;
  const y1 = box.y + box.height * ty;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
}

const browser = await chromium.launch();
const results = [];

async function runViewport(label, viewport) {
  const page = await browser.newPage({
    viewport,
    hasTouch: true,
    isMobile: viewport.width < 600,
  });
  await page.goto(`${BASE}/dev/board-draw`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(700);

  const initial = await measure(page);
  const h0 = initial.surfaceH;

  // Height stability: many draws + FS toggles
  await page.locator(".cm-board-tool-chip", { hasText: "描く" }).click();
  const heights = [h0];
  for (let i = 0; i < 12; i++) {
    await strokeAt(page, 0.1 + (i % 5) * 0.05, 0.2, 0.4, 0.5);
    await page.waitForTimeout(40);
    heights.push((await measure(page)).surfaceH);
  }
  for (let i = 0; i < 10; i++) {
    await page.locator(".cm-board-tool-chip--fullscreen").click();
    await page.waitForTimeout(250);
    await page.locator(".cm-board-fs-exit").click();
    await page.waitForTimeout(250);
    heights.push((await measure(page)).surfaceH);
  }

  const maxH = Math.max(...heights.filter((n) => typeof n === "number"));
  const minH = Math.min(...heights.filter((n) => typeof n === "number"));
  const heightDrift = maxH - minH;

  // Fullscreen fill + corner draws
  await page.locator(".cm-board-tool-chip--fullscreen").click();
  await page.waitForTimeout(500);
  const fs = await measure(page);
  const ink0 = await sampleInk(page);

  const corners = [
    [0.02, 0.02, 0.08, 0.08],
    [0.92, 0.02, 0.98, 0.08],
    [0.02, 0.92, 0.08, 0.98],
    [0.92, 0.92, 0.98, 0.98],
    [0.45, 0.45, 0.55, 0.55],
  ];
  for (const [a, b, c, d] of corners) {
    await strokeAt(page, a, b, c, d);
    await page.waitForTimeout(50);
  }
  const inkCorners = await sampleInk(page);
  await page.screenshot({
    path: `${OUT}/board_fs_fill_${label}.png`,
    fullPage: false,
  });

  await page.locator(".cm-board-fs-exit").click();
  await page.waitForTimeout(400);
  const after = await measure(page);
  const inkAfter = await sampleInk(page);
  await page.screenshot({
    path: `${OUT}/board_normal_stable_${label}.png`,
    fullPage: true,
  });

  const fillRatioW = fs.canvas && fs.scroll ? fs.canvas.w / fs.scroll.w : 0;
  const fillRatioH = fs.canvas && fs.scroll ? fs.canvas.h / fs.scroll.h : 0;

  const row = {
    label,
    viewport,
    h0,
    heightDrift,
    heightsSample: heights.slice(0, 5).concat(heights.slice(-3)),
    fs,
    fillRatioW,
    fillRatioH,
    ink0,
    inkCorners,
    inkAfter,
    afterH: after.surfaceH,
    bad: false,
    reasons: [],
  };

  if (heightDrift > 2) {
    row.bad = true;
    row.reasons.push(`height drift ${heightDrift}px (h0=${h0})`);
  }
  if (!fs.fullscreen) {
    row.bad = true;
    row.reasons.push("no fullscreen layer");
  }
  if (fillRatioW < 0.95 || fillRatioH < 0.95) {
    row.bad = true;
    row.reasons.push(
      `canvas does not fill scroll (${fillRatioW.toFixed(3)}x${fillRatioH.toFixed(3)})`
    );
  }
  if (fs.canvas?.drawBound !== "fs") {
    row.bad = true;
    row.reasons.push(`drawBound=${fs.canvas?.drawBound}`);
  }
  if (!(inkCorners.ink > ink0.ink)) {
    row.bad = true;
    row.reasons.push("corner draws added no ink");
  }
  if (inkAfter.ink < 5) {
    row.bad = true;
    row.reasons.push("strokes lost after exit");
  }
  if (Math.abs((after.surfaceH ?? 0) - h0) > 2) {
    row.bad = true;
    row.reasons.push(`height after exit ${after.surfaceH} != ${h0}`);
  }

  results.push(row);
  await page.close();
}

await runViewport("390", { width: 390, height: 844 });
await runViewport("375", { width: 375, height: 812 });
await runViewport("ipad-portrait", { width: 768, height: 1024 });
await runViewport("ipad-landscape", { width: 1024, height: 768 });

fs.writeFileSync(
  `${OUT}/board_fullscreen_draw_verify.json`,
  JSON.stringify(results, null, 2)
);
console.log(JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.some((r) => r.bad) ? 1 : 0);
