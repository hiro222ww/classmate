/**
 * Mobile screenshots + overflow probe for waiting room (/room) and call chrome.
 * Call chrome uses local /dev/call-chrome (no admin auth).
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/capture-room-call-ui-fix.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
fs.mkdirSync(OUT, { recursive: true });

const classId = "00000000-0000-4000-8000-000000000111";
const sessionId = "00000000-0000-4000-8000-000000000222";
const deviceId = "00000000-0000-4000-8000-000000000123";
const user = {
  id: "00000000-0000-4000-8000-000000000456",
  aud: "authenticated",
  role: "authenticated",
  is_anonymous: true,
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-09-01T00:00:00Z",
};
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;

const WIDTHS = [375, 390, 430];
const IPAD = [
  { name: "ipad-portrait", width: 768, height: 1024 },
  { name: "ipad-landscape", width: 1024, height: 768 },
];

async function measureOverflow(page) {
  return page.evaluate(() => {
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
      if (el.closest(".cm-call-surface-panel--inactive")) continue;
      if (el.closest(".classmate-board-scroll, .classmate-board-root")) continue;
      if (el.classList?.contains("cm-room-session-hero-img")) continue;
      if (rect.right > clientW + 1 || rect.left < -1) {
        offenders.push({
          score: Math.max(rect.right - clientW, -rect.left),
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 120),
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
}

async function probeHeroArtifact(page) {
  return page.evaluate(() => {
    const hero = document.querySelector(".cm-room-session-hero");
    if (!hero) return { found: false };
    const before = getComputedStyle(hero, "::before");
    const media = hero.querySelector(".cm-room-session-hero-media");
    const mediaBefore = media ? getComputedStyle(media, "::before") : null;
    const firstChild = hero.querySelector(":scope > div:first-child");
    const padLeft = firstChild
      ? parseFloat(getComputedStyle(firstChild).paddingLeft || "0")
      : 0;
    return {
      found: true,
      beforeContent: before.content,
      beforeDisplay: before.display,
      beforeWidth: before.width,
      mediaBeforeContent: mediaBefore?.content ?? null,
      mediaBeforeDisplay: mediaBefore?.display ?? null,
      firstChildPadLeft: padLeft,
      heroHeight: Math.round(hero.getBoundingClientRect().height),
    };
  });
}

async function probeBoardChrome(page) {
  return page.evaluate(() => {
    const clientW = document.documentElement.clientWidth;
    const swatches = document.querySelector(".cm-board-swatches");
    const toolbar = document.querySelector(".cm-board-toolbar");
    const fullscreenBtn = document.querySelector(
      ".cm-board-tool-chip--fullscreen"
    );
    const recruitInvite = document.querySelector(".cm-call-recruitment-invite");
    const heroInvite = document.querySelector(".cm-room-avatar-invite");
    const swatchRect = swatches?.getBoundingClientRect();
    const toolbarRect = toolbar?.getBoundingClientRect();
    return {
      swatchCount: document.querySelectorAll(".cm-board-swatch").length,
      swatchesOverflowPage: swatchRect
        ? swatchRect.right > clientW + 1 || swatchRect.left < -1
        : false,
      toolbarOverflowPage: toolbarRect
        ? toolbarRect.right > clientW + 1 || toolbarRect.left < -1
        : false,
      swatchesScrollable: swatches
        ? swatches.scrollWidth > swatches.clientWidth + 1
        : false,
      hasFullscreenBtn: Boolean(fullscreenBtn),
      fullscreenDisabled: fullscreenBtn
        ? Boolean(fullscreenBtn.disabled)
        : null,
      recruitInviteCount: recruitInvite ? 1 : 0,
      heroInviteCount: heroInvite ? 1 : 0,
      pageOverflowX:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - clientW,
    };
  });
}

async function mockRoomApis(page) {
  await page.addInitScript((id) => {
    localStorage.setItem("classmate_device_id", id);
  }, deviceId);

  await page.route(/127\.0\.0\.1:54321|supabase\.co/, (route) =>
    route.fulfill({
      json: {
        access_token: token,
        refresh_token: "t",
        token_type: "bearer",
        expires_in: 3600,
        user,
      },
    })
  );

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const members = [
      {
        device_id: deviceId,
        display_name: "くらと",
        photo_path: null,
        is_in_call: false,
      },
      {
        device_id: "m2",
        display_name: "はる",
        photo_path: null,
        is_in_call: false,
      },
      {
        device_id: "m3",
        display_name: "ゆう",
        photo_path: null,
        is_in_call: false,
      },
      {
        device_id: "m4",
        display_name: "あい",
        photo_path: null,
        is_in_call: false,
      },
      {
        device_id: "m5",
        display_name: "けん",
        photo_path: null,
        is_in_call: false,
      },
    ];
    const map = {
      "/api/profile": {
        ok: true,
        profile: {
          device_id: deviceId,
          display_name: "くらと",
          declared_age: 25,
          minimum_profile: true,
        },
      },
      "/api/auth/session": {
        ok: true,
        userId: user.id,
        deviceId,
        isAnonymous: false,
        hasLinkedEmail: true,
        email: "mate@example.com",
      },
      "/api/class/members": { ok: true, members },
      "/api/session/join": {
        ok: true,
        session: {
          id: sessionId,
          class_id: classId,
          status: "forming",
          capacity: 5,
        },
        members,
      },
      "/api/class/mine": {
        ok: true,
        classes: [
          { id: classId, name: "クラス0078Q", topic_title: "フリークラス" },
        ],
      },
    };
    if (pathname.includes("/api/class/") || pathname.includes("/api/session/")) {
      return route.fulfill({
        json: map[pathname] ?? {
          ok: true,
          class: { id: classId, name: "クラス0078Q", topic_key: "free_talk" },
          topic: { title: "フリークラス" },
          session: {
            id: sessionId,
            status: "forming",
            capacity: 5,
            member_count: 5,
          },
          members,
        },
      });
    }
    return route.fulfill({ json: map[pathname] ?? { ok: true } });
  });
}

const browser = await chromium.launch();
const results = [];

for (const width of WIDTHS) {
  const roomPage = await browser.newPage({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockRoomApis(roomPage);
  await roomPage.goto(
    `${BASE}/room?classId=${classId}&sessionId=${sessionId}`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );
  await roomPage.waitForTimeout(3500);
  const roomShot = `${OUT}/room_wait_fix_${width}.png`;
  await roomPage.screenshot({ path: roomShot, fullPage: true });
  const roomOverflow = await measureOverflow(roomPage);
  const roomMarks = {
    hero: await roomPage.locator(".cm-room-session-hero").count(),
    strip: await roomPage.locator(".cm-room-avatar-strip").count(),
    invite: await roomPage.locator(".cm-room-avatar-invite").count(),
    emptySeats: await roomPage.locator(".cm-room-avatar-chip--empty").count(),
    board: await roomPage.locator(".cm-room-chalkboard").count(),
    startBtn: await roomPage.locator(".cm-room-start-btn").count(),
  };
  results.push({
    kind: "room",
    width,
    shot: roomShot,
    overflow: roomOverflow,
    marks: roomMarks,
    bad:
      roomOverflow.overflowX > 1 ||
      roomOverflow.top.some((t) => t.score > 2) ||
      roomMarks.board > 0,
  });
  await roomPage.close();

  const callPage = await browser.newPage({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await callPage.goto(`${BASE}/dev/call-chrome?scene=multi`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await callPage.waitForTimeout(2000);
  const callShot = `${OUT}/call_room_fix_${width}.png`;
  await callPage.screenshot({ path: callShot, fullPage: true });
  const callOverflow = await measureOverflow(callPage);
  const heroProbe = await probeHeroArtifact(callPage);
  const boardProbe = await probeBoardChrome(callPage);
  const callMarks = {
    hero: await callPage.locator(".cm-room-session-hero").count(),
    dock: await callPage.locator(".cm-call-dock").count(),
    tabs: await callPage.locator(".cm-call-surface-tab").count(),
    oldSeats: await callPage.locator(".cm-call-seat").count(),
    oldFloating: await callPage.locator(".cm-call-floating-dock").count(),
    recruitInvite: await callPage.locator(".cm-call-recruitment-invite").count(),
    heroInvite: await callPage.locator(".cm-room-avatar-invite").count(),
    emptySeats: await callPage.locator(".cm-room-avatar-chip--empty").count(),
    fullscreenBtn: await callPage
      .locator(".cm-board-tool-chip--fullscreen")
      .count(),
  };

  let fsOk = false;
  let fsExitOk = false;
  let fsShot = null;
  if (callMarks.fullscreenBtn > 0) {
    await callPage.locator(".cm-board-tool-chip--fullscreen").first().click();
    await callPage.waitForTimeout(500);
    fsOk = (await callPage.locator(".classmate-board-fullscreen-layer").count()) > 0;
    fsShot = `${OUT}/call_board_fullscreen_${width}.png`;
    await callPage.screenshot({ path: fsShot, fullPage: false });
    await callPage.locator(".cm-board-fs-exit").first().click();
    await callPage.waitForTimeout(400);
    fsExitOk =
      (await callPage.locator(".classmate-board-fullscreen-layer").count()) === 0;
  }

  await callPage.locator(".cm-call-surface-tab").nth(1).click();
  await callPage.waitForTimeout(400);
  const callChatShot = `${OUT}/call_room_chat_${width}.png`;
  await callPage.screenshot({ path: callChatShot, fullPage: true });

  results.push({
    kind: "call",
    width,
    shot: callShot,
    chatShot: callChatShot,
    fsShot,
    overflow: callOverflow,
    heroProbe,
    boardProbe,
    marks: callMarks,
    fsOk,
    fsExitOk,
    bad:
      callOverflow.overflowX > 1 ||
      callOverflow.top.some((t) => t.score > 2) ||
      callMarks.hero < 1 ||
      callMarks.dock < 1 ||
      callMarks.tabs < 2 ||
      callMarks.oldSeats > 0 ||
      callMarks.oldFloating > 0 ||
      callMarks.recruitInvite > 0 ||
      callMarks.heroInvite < 1 ||
      callMarks.fullscreenBtn < 1 ||
      boardProbe.swatchesOverflowPage ||
      boardProbe.toolbarOverflowPage ||
      boardProbe.pageOverflowX > 1 ||
      heroProbe.beforeContent === '" "' ||
      (heroProbe.beforeDisplay &&
        heroProbe.beforeDisplay !== "none" &&
        heroProbe.beforeContent !== "none") ||
      heroProbe.firstChildPadLeft >= 40 ||
      !fsOk ||
      !fsExitOk,
  });
  await callPage.close();
}

for (const pad of IPAD) {
  const callPage = await browser.newPage({
    viewport: { width: pad.width, height: pad.height },
    hasTouch: true,
  });
  await callPage.goto(`${BASE}/dev/call-chrome?scene=multi`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await callPage.waitForTimeout(2000);
  const shot = `${OUT}/call_room_fix_${pad.name}.png`;
  await callPage.screenshot({ path: shot, fullPage: true });
  const boardProbe = await probeBoardChrome(callPage);
  const heroProbe = await probeHeroArtifact(callPage);
  let fsOk = false;
  let fsShot = null;
  if (boardProbe.hasFullscreenBtn) {
    await callPage.locator(".cm-board-tool-chip--fullscreen").first().click();
    await callPage.waitForTimeout(500);
    fsOk = (await callPage.locator(".classmate-board-fullscreen-layer").count()) > 0;
    fsShot = `${OUT}/call_board_fullscreen_${pad.name}.png`;
    await callPage.screenshot({ path: fsShot, fullPage: false });
    await callPage.locator(".cm-board-fs-exit").first().click();
    await callPage.waitForTimeout(300);
  }
  results.push({
    kind: "call-ipad",
    name: pad.name,
    width: pad.width,
    height: pad.height,
    shot,
    fsShot,
    boardProbe,
    heroProbe,
    fsOk,
    bad:
      boardProbe.swatchesOverflowPage ||
      boardProbe.toolbarOverflowPage ||
      boardProbe.pageOverflowX > 1 ||
      boardProbe.recruitInviteCount > 0 ||
      !fsOk,
  });
  await callPage.close();
}

fs.writeFileSync(
  `${OUT}/room_call_ui_fix_verify.json`,
  JSON.stringify(results, null, 2)
);
console.log(JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.some((r) => r.bad) ? 1 : 0);
