import { chromium, devices } from "@playwright/test";
import fs from "fs";

const out = "docs/theme-home-nav";
const deviceId =
  process.env.SHOT_DEVICE_ID || "855cbbba-787d-40aa-8d33-f8f0931aae02";
const base = process.env.SHOT_BASE || "http://127.0.0.1:3022";
const membershipDeviceId = process.env.SHOT_MEMBERSHIP_DEVICE_ID || "";

async function withPage(opts, fn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((id) => {
    localStorage.setItem("classmate_device_id", id);
  }, deviceId);
  const page = await ctx.newPage();
  try {
    return await fn(page, browser, ctx);
  } finally {
    await browser.close();
  }
}

async function shot(name, opts, path, extra) {
  await withPage(opts, async (page) => {
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    if (extra) await extra(page);
    await page.screenshot({ path: `${out}/${name}`, fullPage: false });
    console.log("wrote", name);
  });
}

fs.mkdirSync(out, { recursive: true });

await shot("home-pc.png", { viewport: { width: 1280, height: 900 } }, "/");
await shot("home-mobile.png", { ...devices["iPhone 13"] }, "/");
await shot(
  "select-pc.png",
  { viewport: { width: 1280, height: 900 } },
  "/class/select"
);
await shot("select-mobile.png", { ...devices["iPhone 13"] }, "/class/select");
await shot(
  "mine-pc.png",
  { viewport: { width: 1280, height: 900 } },
  "/class/mine"
);
await shot("mine-mobile.png", { ...devices["iPhone 13"] }, "/class/mine");
await shot(
  "home-menu-pc.png",
  { viewport: { width: 1280, height: 900 } },
  "/",
  async (page) => {
    const btn = page.locator(".cm-hamburger-btn").first();
    await btn.click({ timeout: 10000 });
    await page.waitForTimeout(800);
    const mineLink = page.getByRole("link", { name: /マイクラス/ }).first();
    await mineLink.waitFor({ state: "visible", timeout: 10000 });
    const href = await mineLink.getAttribute("href");
    if (!href || !href.includes("/class/mine")) {
      throw new Error(`menu マイクラス href expected /class/mine, got ${href}`);
    }
    console.log("menu マイクラス href ok:", href);
  }
);

// Assert home mobile first viewport CTAs + absent legacy copy
{
  const vh = devices["iPhone 13"].viewport.height;
  await withPage({ ...devices["iPhone 13"] }, async (page) => {
    await page.goto(base + "/", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);
    const primary = page.getByRole("button", {
      name: /最大5人で話す|管理者としてテスト入室|入学受付時間外|参加中/,
    });
    const secondary = page.getByRole("link", { name: "テーマを選んで話す" });
    await primary.first().waitFor({ state: "visible", timeout: 10000 });
    await secondary.first().waitFor({ state: "visible", timeout: 10000 });
    const primaryBox = await primary.first().boundingBox();
    const secondaryBox = await secondary.first().boundingBox();
    if (!primaryBox || primaryBox.y + primaryBox.height > vh) {
      throw new Error(
        `primary CTA not fully in first viewport: ${JSON.stringify(primaryBox)}`
      );
    }
    if (!secondaryBox || secondaryBox.y + secondaryBox.height > vh) {
      throw new Error(
        `secondary CTA not fully in first viewport: ${JSON.stringify(secondaryBox)}`
      );
    }
    const body = await page.locator("body").innerText();
    for (const forbidden of ["入る場所を選ぶ", "新しく参加する", "クラスを見る"]) {
      if (body.includes(forbidden)) {
        throw new Error(`home should not contain 「${forbidden}」`);
      }
    }
    console.log("home mobile assertions ok", {
      primaryY: primaryBox.y,
      secondaryY: secondaryBox.y,
    });
  });
}

// Assert /class/select heading
{
  await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    await page.goto(base + "/class/select", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
    const heading = page.getByRole("heading", { name: "テーマを選んで話す" });
    await heading.first().waitFor({ state: "visible", timeout: 10000 });
    const body = await page.locator("body").innerText();
    if (body.includes("テーマから探す")) {
      throw new Error("select should not show 「テーマから探す」");
    }
    console.log("select assertions ok");
  });
}

// Assert /class/mine heading + empty or rows
{
  await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    await page.goto(base + "/class/mine", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    const heading = page.getByRole("heading", { name: "マイクラス" });
    await heading.first().waitFor({ state: "visible", timeout: 10000 });
    const body = await page.locator("body").innerText();
    const hasEmpty = body.includes("所属しているクラスはありません");
    const hasError =
      body.includes("端末IDが必要") || body.includes("取得に失敗");
    if (hasError && hasEmpty) {
      throw new Error("mine shows error and empty together");
    }
    if (!hasEmpty && !page.locator(".cm-mine-class-row").first()) {
      // rows optional; empty OR rows required
    }
    const rowCount = await page.locator(".cm-mine-class-row").count();
    if (!hasEmpty && rowCount === 0) {
      throw new Error("mine has neither empty copy nor class rows");
    }
    if (hasEmpty && hasError) {
      throw new Error("mine error+empty");
    }
    console.log("mine assertions ok", { hasEmpty, rowCount, hasError });
  });
}

// Optional: device with memberships
async function tryFindMembershipDevice() {
  if (membershipDeviceId) return membershipDeviceId;
  // Probe a few known/local UUIDs via public API only
  const candidates = [
    deviceId,
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ];
  for (const id of candidates) {
    try {
      const res = await fetch(
        `${base}/api/class/mine?deviceId=${encodeURIComponent(id)}&lite=1`,
        { headers: { "x-device-id": id } }
      );
      const json = await res.json();
      const n = Array.isArray(json?.classes) ? json.classes.length : 0;
      if (json?.ok && n > 0) {
        console.log("found membership device", id, "classes", n);
        return id;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

const memberId = await tryFindMembershipDevice();
if (memberId) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await ctx.addInitScript((id) => {
    localStorage.setItem("classmate_device_id", id);
  }, memberId);
  const page = await ctx.newPage();
  await page.goto(base + "/class/mine", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: `${out}/mine-with-classes-pc.png`,
    fullPage: false,
  });
  console.log("wrote mine-with-classes-pc.png");
  await browser.close();
} else {
  console.log("skip mine-with-classes-pc.png (no membership device found)");
}

console.log("all screenshots ok");
