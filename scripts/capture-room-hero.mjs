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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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
    "/api/class/members": {
      ok: true,
      members: [
        {
          device_id: deviceId,
          display_name: "くらと",
          photo_path: null,
          is_in_call: false,
        },
      ],
    },
    "/api/session/join": {
      ok: true,
      session: {
        id: sessionId,
        class_id: classId,
        status: "forming",
        capacity: 5,
      },
      members: [
        {
          device_id: deviceId,
          display_name: "くらと",
          photo_path: null,
        },
      ],
    },
    "/api/class/mine": {
      ok: true,
      classes: [{ id: classId, name: "クラス0078Q", topic_title: "フリークラス" }],
    },
  };
  if (pathname.includes("/api/class/") || pathname.includes("/api/session/")) {
    // Fallthrough flexible mock for room status endpoints
    return route.fulfill({
      json: map[pathname] ?? {
        ok: true,
        class: { id: classId, name: "クラス0078Q", topic_key: "free_talk" },
        topic: { title: "フリークラス" },
        session: {
          id: sessionId,
          status: "forming",
          capacity: 5,
          member_count: 1,
        },
        members: [
          {
            device_id: deviceId,
            display_name: "くらと",
            photo_path: null,
          },
        ],
      },
    });
  }
  return route.fulfill({ json: map[pathname] ?? { ok: true } });
});

const url = `${BASE}/room?classId=${classId}&sessionId=${sessionId}`;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3500);
await page.screenshot({
  path: `${OUT}/room_hero_avatar_strip_390.png`,
  fullPage: true,
});

const hero = await page.locator(".cm-room-session-hero").count();
const strip = await page.locator(".cm-room-avatar-strip").count();
const invite = await page.locator(".cm-room-avatar-chip--invite").count();
const oldInviteCard = await page.locator(".cm-room-invite").count();
const startBtn = await page.locator(".cm-room-start-btn").count();

const summary = { hero, strip, invite, oldInviteCard, startBtn };
fs.writeFileSync(`${OUT}/room_hero_verify.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
process.exit(hero > 0 && strip > 0 && invite > 0 && oldInviteCard === 0 ? 0 : 1);
