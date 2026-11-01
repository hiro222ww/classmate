/**
 * Waiting-room start button contrast + count label probe.
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/verify-room-start-btn-contrast.mjs
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

function parseRgb(input) {
  if (!input) return null;
  if (input === "rgba(0, 0, 0, 0)" || input === "transparent") return null;
  const m = String(input).match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/
  );
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] == null ? 1 : Number(m[4]),
  };
}

function relLuminance({ r, g, b }) {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(a, b) {
  const L1 = relLuminance(a);
  const L2 = relLuminance(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

async function mockApis(page, { delayMembersMs = 0 } = {}) {
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
    if (pathname.includes("/api/class/members") && delayMembersMs > 0) {
      await new Promise((r) => setTimeout(r, delayMembersMs));
    }
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
            member_count: members.length,
          },
          members,
        },
      });
    }
    return route.fulfill({ json: map[pathname] ?? { ok: true } });
  });
}

async function probeButton(page) {
  return page.evaluate(() => {
    const btn = document.querySelector(".cm-room-start-btn");
    const meta = document.querySelector(".cm-room-session-hero-meta");
    if (!btn) return { found: false };
    const cs = getComputedStyle(btn);
    const rect = btn.getBoundingClientRect();
    return {
      found: true,
      text: (btn.textContent || "").trim(),
      disabled: btn.disabled,
      color: cs.color,
      webkitFill: cs.webkitTextFillColor,
      opacity: cs.opacity,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      backgroundImage: cs.backgroundImage,
      backgroundColor: cs.backgroundColor,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      metaText: meta ? (meta.textContent || "").trim() : null,
    };
  });
}

const browser = await chromium.launch();
const results = [];

// Ready-ish state (members resolve quickly)
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockApis(page);
  await page.goto(
    `${BASE}/room?classId=${classId}&sessionId=${sessionId}`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );
  await page.waitForTimeout(3500);
  const probe = await probeButton(page);
  await page.locator(".cm-room-session-hero").screenshot({
    path: `${OUT}/room_start_btn_ready_390.png`,
  });
  await page.screenshot({
    path: `${OUT}/room_wait_start_btn_390.png`,
    fullPage: true,
  });

  // Force disabled via evaluate to check disabled styles
  await page.evaluate(() => {
    const btn = document.querySelector(".cm-room-start-btn");
    if (btn) btn.disabled = true;
  });
  await page.waitForTimeout(100);
  const disabledProbe = await probeButton(page);
  await page.locator(".cm-room-session-hero").screenshot({
    path: `${OUT}/room_start_btn_disabled_390.png`,
  });

  const color = parseRgb(probe.color);
  const fill = parseRgb(probe.webkitFill);
  const white = { r: 255, g: 255, b: 255 };
  const blueSample = { r: 52, g: 120, b: 246 };
  const ratio = color ? contrastRatio(color, blueSample) : 0;

  const row = {
    kind: "ready",
    probe,
    disabledProbe,
    contrastVsBlue: Number(ratio.toFixed(2)),
    bad: false,
    reasons: [],
  };
  if (!probe.found) {
    row.bad = true;
    row.reasons.push("button missing");
  }
  if (!color || color.r < 240 || color.g < 240 || color.b < 240) {
    row.bad = true;
    row.reasons.push(`color not white: ${probe.color}`);
  }
  if (fill && (fill.r < 240 || fill.g < 240 || fill.b < 240)) {
    row.bad = true;
    row.reasons.push(`webkit fill not white: ${probe.webkitFill}`);
  }
  if (Number(probe.opacity) < 0.99) {
    row.bad = true;
    row.reasons.push(`opacity ${probe.opacity}`);
  }
  if (Number(disabledProbe.opacity) < 0.99) {
    row.bad = true;
    row.reasons.push(`disabled opacity ${disabledProbe.opacity}`);
  }
  if (ratio < 3.5) {
    row.bad = true;
    row.reasons.push(`contrast ${ratio}`);
  }
  results.push(row);
  await page.close();
}

// Loading count label (--/5人) while members delayed
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockApis(page, { delayMembersMs: 2500 });
  await page.goto(
    `${BASE}/room?classId=${classId}&sessionId=${sessionId}`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );
  await page.waitForTimeout(800);
  const early = await probeButton(page);
  await page.locator(".cm-room-session-hero").screenshot({
    path: `${OUT}/room_start_btn_loading_390.png`,
  });
  results.push({
    kind: "loading",
    early,
    pendingCountShown: Boolean(
      early.metaText && /(--|–|−|…|確認中)/.test(early.metaText)
    ),
    bad: false,
    reasons: [],
  });
  await page.close();
}

fs.writeFileSync(
  `${OUT}/room_start_btn_contrast_verify.json`,
  JSON.stringify(results, null, 2)
);
console.log(JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.some((r) => r.bad) ? 1 : 0);
