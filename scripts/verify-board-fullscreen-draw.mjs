/**
 * Verify fullscreen board: aspect ratio letterbox + pointer rebind + stroke persist.
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/verify-board-fullscreen-draw.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
fs.mkdirSync(OUT, { recursive: true });

const LOGICAL_ASPECT = 2200 / 1100;

async function measureSurface(page) {
  return page.evaluate((logicalAspect) => {
    const surface = document.querySelector(".classmate-board-surface");
    const canvas = document.querySelector(".classmate-board-canvas");
    const toolbar = document.querySelector(".cm-board-toolbar");
    const layer = document.querySelector(".classmate-board-fullscreen-layer");
    if (!surface || !canvas) return { ok: false, reason: "missing surface/canvas" };
    const sr = surface.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const tr = toolbar?.getBoundingClientRect();
    const aspect = sr.width / Math.max(1, sr.height);
    const aspectErr = Math.abs(aspect - logicalAspect) / logicalAspect;
    return {
      ok: true,
      surface: {
        w: Math.round(sr.width),
        h: Math.round(sr.height),
        aspect: Number(aspect.toFixed(4)),
        aspectErr: Number(aspectErr.toFixed(4)),
      },
      canvas: {
        w: Math.round(cr.width),
        h: Math.round(cr.height),
        cssW: canvas.clientWidth,
        cssH: canvas.clientHeight,
        bufW: canvas.width,
        bufH: canvas.height,
        drawBound: canvas.dataset.drawBound || null,
      },
      toolbarH: tr ? Math.round(tr.height) : null,
      fullscreen: Boolean(layer),
      pageOverflowX:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - document.documentElement.clientWidth,
    };
  }, LOGICAL_ASPECT);
}

async function strokeOnCanvas(page, { x0, y0, x1, y1 }) {
  const box = await page.locator(".classmate-board-canvas").boundingBox();
  if (!box) throw new Error("no canvas box");
  const startX = box.x + box.width * x0;
  const startY = box.y + box.height * y0;
  const endX = box.x + box.width * x1;
  const endY = box.y + box.height * y1;
  await page.locator(".classmate-board-canvas").dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    buttons: 1,
    clientX: startX,
    clientY: startY,
  });
  // Prefer real mouse path for paint (dispatch alone may not hit listeners the same way)
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
}

async function sampleInk(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".classmate-board-canvas");
    if (!canvas) return { ink: 0 };
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ink: 0 };
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    // Count near-white chalk pixels (board green is dark)
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
  await page.waitForTimeout(800);

  // Draw in normal mode
  await page.locator(".cm-board-tool-chip", { hasText: "描く" }).click();
  await strokeOnCanvas(page, { x0: 0.2, y0: 0.35, x1: 0.55, y1: 0.55 });
  await page.waitForTimeout(200);
  const inkBefore = await sampleInk(page);
  const before = await measureSurface(page);
  await page.screenshot({
    path: `${OUT}/board_draw_normal_${label}.png`,
    fullPage: true,
  });

  await page.locator(".cm-board-tool-chip--fullscreen").click();
  await page.waitForTimeout(600);

  const fsMeasure = await measureSurface(page);
  const inkFs = await sampleInk(page);
  await page.screenshot({
    path: `${OUT}/board_draw_fs_${label}.png`,
    fullPage: false,
  });

  // Draw again in fullscreen
  await strokeOnCanvas(page, { x0: 0.6, y0: 0.3, x1: 0.8, y1: 0.7 });
  await page.waitForTimeout(200);
  const inkFsAfter = await sampleInk(page);

  await page.locator(".cm-board-fs-exit").click();
  await page.waitForTimeout(500);
  const afterExit = await measureSurface(page);
  const inkAfter = await sampleInk(page);
  await page.screenshot({
    path: `${OUT}/board_draw_after_${label}.png`,
    fullPage: true,
  });

  // Re-enter FS and confirm still drawable (compare ink at same FS resolution)
  await page.locator(".cm-board-tool-chip--fullscreen").click();
  await page.waitForTimeout(500);
  const reFs = await measureSurface(page);
  const inkReFsBefore = await sampleInk(page);
  await strokeOnCanvas(page, { x0: 0.15, y0: 0.7, x1: 0.4, y1: 0.4 });
  await page.waitForTimeout(200);
  const inkReFs = await sampleInk(page);
  await page.locator(".cm-board-fs-exit").click();
  await page.waitForTimeout(300);

  const row = {
    label,
    viewport,
    inkBefore,
    inkFs,
    inkFsAfter,
    inkAfter,
    inkReFsBefore,
    inkReFs,
    before,
    fsMeasure,
    afterExit,
    reFs,
    bad: false,
    reasons: [],
  };

  if (inkBefore.ink < 5) {
    row.bad = true;
    row.reasons.push("no ink in normal mode");
  }
  if (!fsMeasure.fullscreen) {
    row.bad = true;
    row.reasons.push("fullscreen layer missing");
  }
  if (fsMeasure.surface?.aspectErr > 0.08) {
    row.bad = true;
    row.reasons.push(`aspect err ${fsMeasure.surface.aspectErr}`);
  }
  if (fsMeasure.canvas?.drawBound !== "fs") {
    row.bad = true;
    row.reasons.push(`drawBound=${fsMeasure.canvas?.drawBound}`);
  }
  if (!(inkFsAfter.ink > inkFs.ink)) {
    row.bad = true;
    row.reasons.push("fullscreen draw did not add ink");
  }
  if (inkAfter.ink < inkBefore.ink) {
    row.bad = true;
    row.reasons.push("ink lost after exiting fullscreen");
  }
  if (!(inkReFs.ink > inkReFsBefore.ink)) {
    row.bad = true;
    row.reasons.push("re-enter fullscreen draw failed");
  }
  // Strokes from normal mode must still be present after FS re-entry (same FS scale).
  if (inkReFsBefore.ink < Math.max(1, Math.floor(inkFsAfter.ink * 0.5))) {
    row.bad = true;
    row.reasons.push("strokes missing after re-enter fullscreen");
  }
  if ((fsMeasure.toolbarH ?? 999) > 120) {
    row.bad = true;
    row.reasons.push(`toolbar too tall: ${fsMeasure.toolbarH}`);
  }
  if ((fsMeasure.pageOverflowX ?? 0) > 1) {
    row.bad = true;
    row.reasons.push("page overflow x");
  }
  // Board should use most of the shorter viewport edge (letterboxed, not tiny).
  const shortEdge = Math.min(viewport.width, viewport.height);
  if ((fsMeasure.surface?.w ?? 0) < shortEdge * 0.55) {
    row.bad = true;
    row.reasons.push(
      `surface too small: ${fsMeasure.surface?.w} < ${Math.round(shortEdge * 0.55)}`
    );
  }

  results.push(row);
  await page.close();
}

await runViewport("390", { width: 390, height: 844 });
await runViewport("375", { width: 375, height: 812 });
await runViewport("ipad-portrait", { width: 768, height: 1024 });
await runViewport("ipad-landscape", { width: 1024, height: 768 });

// call-chrome aspect/toolbar smoke (preview board has surface, no live canvas)
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`${BASE}/dev/call-chrome?scene=multi`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  await page.locator(".cm-board-tool-chip--fullscreen").click();
  await page.waitForTimeout(500);
  const chromeFs = await page.evaluate((logicalAspect) => {
    const surface = document.querySelector(".classmate-board-surface");
    const toolbar = document.querySelector(".cm-board-toolbar");
    const layer = document.querySelector(".classmate-board-fullscreen-layer");
    const sr = surface?.getBoundingClientRect();
    const tr = toolbar?.getBoundingClientRect();
    const aspect = sr ? sr.width / Math.max(1, sr.height) : 0;
    return {
      fullscreen: Boolean(layer),
      surfaceW: sr ? Math.round(sr.width) : 0,
      surfaceH: sr ? Math.round(sr.height) : 0,
      aspectErr: sr
        ? Math.abs(aspect - logicalAspect) / logicalAspect
        : 1,
      toolbarH: tr ? Math.round(tr.height) : 999,
    };
  }, LOGICAL_ASPECT);
  await page.screenshot({
    path: `${OUT}/call_chrome_fs_aspect_390.png`,
    fullPage: false,
  });
  const reasons = [];
  if (!chromeFs.fullscreen) reasons.push("no fs layer");
  if (chromeFs.aspectErr > 0.08) reasons.push(`aspect ${chromeFs.aspectErr}`);
  if (chromeFs.toolbarH > 120) reasons.push(`toolbar ${chromeFs.toolbarH}`);
  results.push({
    label: "call-chrome-390",
    chromeFs,
    bad: reasons.length > 0,
    reasons,
  });
  await page.close();
}

fs.writeFileSync(
  `${OUT}/board_fullscreen_draw_verify.json`,
  JSON.stringify(results, null, 2)
);
console.log(JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.some((r) => r.bad) ? 1 : 0);
