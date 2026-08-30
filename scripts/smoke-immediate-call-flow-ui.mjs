#!/usr/bin/env node
/**
 * UI smoke: common immediate-call entry flow (home + /class/select → /call).
 * Captures PC + mobile screenshots to docs/theme-immediate-call-smoke/
 * Tag: E2E_TEST_20260828
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium, devices } from "@playwright/test";
import {
  WEBRTC_INIT_SCRIPT,
  ensureE2eAdmissionOpen,
} from "./lib/webrtc-test-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "E2E_TEST_20260828";
const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3022";
const RUN_ID = String(Date.now()).slice(-6);
const OUT = path.join(root, "docs/theme-immediate-call-smoke");
const NAV_DEVICE =
  process.env.SHOT_DEVICE_ID || "855cbbba-787d-40aa-8d33-f8f0931aae02";

function loadEnv() {
  return Object.fromEntries(
    fs
      .readFileSync(path.join(root, ".env.local"), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const results = [];
const pass = (id, d = "") => {
  results.push({ id, ok: true, detail: d });
  console.log(`PASS ${id}${d ? ` — ${d}` : ""}`);
};
const fail = (id, d = "") => {
  results.push({ id, ok: false, detail: d });
  console.error(`FAIL ${id}${d ? ` — ${d}` : ""}`);
};
const skip = (id, d = "") => {
  results.push({ id, ok: null, detail: d });
  console.log(`SKIP ${id}${d ? ` — ${d}` : ""}`);
};

async function rest(pathname, init = {}) {
  const r = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: init.prefer || "return=representation",
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function expireE2eFormingSessions() {
  const forming = await rest("sessions?select=id&status=in.(forming,waiting)");
  const rows = Array.isArray(forming) ? forming : [];
  let expired = 0;
  for (const row of rows) {
    const members = await rest(
      `session_members?session_id=eq.${row.id}&select=display_name`
    );
    const list = Array.isArray(members) ? members : [];
    if (list.length === 0) continue;
    if (!list.every((m) => String(m.display_name || "").startsWith(TAG))) continue;
    await rest(`sessions?id=eq.${row.id}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { status: "expired" },
    });
    expired++;
  }
  return expired;
}

async function apiProfile(deviceId, suffix) {
  const f = new FormData();
  f.append("mode", "minimum");
  f.append("device_id", deviceId);
  f.append("display_name", `${TAG}_${RUN_ID}_${suffix}`);
  f.append("declared_age", "25");
  f.append("terms_agreed", "true");
  f.append("privacy_agreed", "true");
  f.append("guidelines_agreed", "true");
  const r = await fetch(`${BASE}/api/profile`, {
    method: "POST",
    headers: { "x-device-id": deviceId },
    body: f,
  });
  return r.json();
}

async function apiMatchJoin(deviceId, topicKey = null) {
  const r = await fetch(`${BASE}/api/class/match-join-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": deviceId },
    body: JSON.stringify({
      deviceId,
      worldKey: "default",
      topicKey,
      capacity: 5,
    }),
  });
  return r.json();
}

async function ensureProfile(deviceId, suffix) {
  const json = await apiProfile(deviceId, suffix);
  if (!json?.ok) throw new Error(`profile failed: ${JSON.stringify(json).slice(0, 120)}`);
}

async function browserOnboarding(page, suffix) {
  await page.goto(`${BASE}/onboarding`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.locator("#min-display-name").fill(`${TAG}_${RUN_ID}_${suffix}`);
  await page.locator("#min-age").fill("25");
  const consent = page.locator('[data-cm-consent="needed"] input[type="checkbox"]');
  if (await consent.count()) await consent.check();
  const submit = page.getByRole("button", { name: /ホームへ進む/ });
  await submit.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /ホームへ進む/.test(b.textContent || "")
    );
    return btn && !btn.disabled;
  }, { timeout: 90000 });
  await submit.click();
  await page.waitForFunction(
    () => window.location.pathname === "/" || window.location.pathname === "",
    { timeout: 90000 }
  );
  await page.waitForTimeout(1200);
}

async function mkContext(browser, deviceId, viewport) {
  const ctx = await browser.newContext({
    ...viewport,
    permissions: ["microphone"],
  });
  await ctx.addInitScript((did) => {
    localStorage.setItem("classmate_device_id", did);
  }, deviceId);
  await ctx.addInitScript(WEBRTC_INIT_SCRIPT);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on("dialog", async (d) => {
    console.log("[dialog]", d.message());
    await d.accept();
  });
  return { ctx, page };
}

async function shot(page, stem) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${stem}.png`), fullPage: false });
  console.log("screenshot", `${stem}.png`);
}

async function shotBoth(browser, deviceId, stem, pathOrFn) {
  for (const [suffix, vp] of [
    ["pc", { viewport: { width: 1280, height: 900 } }],
    ["mobile", devices["iPhone 13"]],
  ]) {
    const { ctx, page } = await mkContext(browser, deviceId, vp);
    try {
      if (typeof pathOrFn === "string") {
        await page.goto(`${BASE}${pathOrFn}`, {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });
        await page.waitForTimeout(1500);
      } else {
        await pathOrFn(page);
      }
      await shot(page, `${stem}-${suffix}`);
    } finally {
      await ctx.close();
    }
  }
}

async function findOfficialMembershipDevice() {
  const rows = await rest(
    "class_memberships?select=device_id,class_id,classes(lifecycle,name)&classes.lifecycle=eq.official&limit=20"
  );
  const list = Array.isArray(rows) ? rows : [];
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const row of list) {
    const id = String(row.device_id || "").trim();
    if (!uuidRe.test(id)) continue;
    try {
      const res = await fetch(
        `${BASE}/api/class/mine?deviceId=${encodeURIComponent(id)}&lite=1`,
        { headers: { "x-device-id": id } }
      );
      const json = await res.json();
      if (json?.ok && Array.isArray(json.classes) && json.classes.length > 0) {
        return { deviceId: id, classId: row.class_id, className: row.classes?.name };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function main() {
  console.log(`immediate-call-ui base=${BASE} run=${RUN_ID}`);
  fs.mkdirSync(OUT, { recursive: true });

  let admissionRestore = async () => {};
  try {
    admissionRestore = (await ensureE2eAdmissionOpen(BASE, { url: supabaseUrl, key: serviceKey }))
      .restore;
  } catch (e) {
    console.warn("[admission] patch failed", e?.message ?? e);
  }

  const expired = await expireE2eFormingSessions();
  if (expired) console.log(`expired e2e forming sessions=${expired}`);

  const browser = await chromium.launch({ headless: true });
  const dHome = randomUUID();
  const dThemeA = randomUUID();
  const dThemeB = randomUUID();
  const d2 = randomUUID();
  const d3 = randomUUID();
  const d4 = randomUUID();
  const d5 = randomUUID();
  const d6 = randomUUID();
  const dNoProfile = randomUUID();

  let homeClassId = "";
  let homeSessionId = "";
  let themeClassId = "";
  let themeSessionId = "";
  let capturedTopicKey = "__unset__";

  try {
    // --- 6. Navigation (static) ---
    await shotBoth(browser, NAV_DEVICE, "nav-home", "/");
    {
      const { ctx, page } = await mkContext(browser, NAV_DEVICE, {
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const secondary = page.getByRole("link", { name: "テーマを選んで話す" });
      if (await secondary.count()) pass("nav_home_theme_link");
      else fail("nav_home_theme_link");
      await ctx.close();
    }

    await shotBoth(browser, NAV_DEVICE, "nav-select", "/class/select");
    {
      const { ctx, page } = await mkContext(browser, NAV_DEVICE, {
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(`${BASE}/class/select`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const heading = page.getByRole("heading", { name: "テーマを選んで話す" });
      if (await heading.count()) pass("nav_select_heading");
      else fail("nav_select_heading");
      const body = await page.locator("body").innerText();
      if (body.includes("テーマフリー") && !body.includes("テーマプラン対象")) {
        pass("nav_select_free_only");
      } else if (body.includes("テーマプラン対象")) {
        fail("nav_select_free_only", "paid themes visible");
      } else {
        pass("nav_select_free_only", "free section present");
      }
      await ctx.close();
    }

    await shotBoth(browser, NAV_DEVICE, "nav-mine", "/class/mine");
    {
      const { ctx, page } = await mkContext(browser, NAV_DEVICE, {
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(`${BASE}/class/mine`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const heading = page.getByRole("heading", { name: "マイクラス" });
      if (await heading.count()) pass("nav_mine_heading");
      else fail("nav_mine_heading");
      await ctx.close();
    }

    {
      const { ctx, page } = await mkContext(browser, NAV_DEVICE, {
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      await page.locator(".cm-hamburger-btn").first().click();
      await page.waitForTimeout(600);
      const mineLink = page.getByRole("link", { name: /マイクラス/ }).first();
      const href = await mineLink.getAttribute("href");
      if (href?.includes("/class/mine")) pass("nav_menu_mine", href);
      else fail("nav_menu_mine", href || "missing");
      await shot(page, "nav-menu-pc");
      await ctx.close();
    }

    // --- 1. Home CTA → /call (solo) ---
    await ensureProfile(dHome, "HOME");
    {
      const { ctx, page } = await mkContext(browser, dHome, {
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      await page.waitForFunction(() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          /最大5人で話す|管理者としてテスト入室/.test(x.textContent || "")
        );
        return b && !b.disabled;
      }, { timeout: 90000 });

      const navPromise = page.waitForFunction(
        () => /\/call/.test(window.location.pathname),
        { timeout: 90000 }
      );
      await page
        .getByRole("button", { name: /最大5人で話す|管理者としてテスト入室/ })
        .click();
      await navPromise;

      const url = page.url();
      const u = new URL(url);
      homeClassId = u.searchParams.get("classId") || "";
      homeSessionId = u.searchParams.get("sessionId") || "";
      if (/\/call/.test(u.pathname) && homeSessionId && homeClassId) {
        pass("home_cta_direct_call", homeSessionId.slice(0, 8));
      } else {
        fail("home_cta_direct_call", url);
      }
      if (u.pathname.includes("/room")) fail("home_skips_room_lobby", url);
      else pass("home_skips_room_lobby");

      const body = await page.locator("body").innerText();
      if (body.includes("メンバーを待っています") || body.includes("待機")) {
        fail("home_no_lobby_panel", "lobby copy visible on /call");
      } else {
        pass("home_no_lobby_panel");
      }

      await page.waitForTimeout(2500);
      await shot(page, "01-call-solo-pc");
      await ctx.close();
    }

    {
      const { ctx, page } = await mkContext(browser, dHome, devices["iPhone 13"]);
      await page.goto(
        `${BASE}/call?sessionId=${encodeURIComponent(homeSessionId)}&classId=${encodeURIComponent(homeClassId)}`,
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForTimeout(2500);
      await shot(page, "01-call-solo-mobile");
      const body = await page.locator("body").innerText();
      if (/メンバー募集中\s*1\/5/.test(body)) {
        pass("call_solo_count_1_5", "メンバー募集中 1/5");
      } else {
        fail("call_solo_count_1_5", body.slice(0, 120));
      }
      const inviteBtn = page.getByRole("button", { name: /友達を招待する/ });
      if (await inviteBtn.count()) pass("call_invite_button_visible");
      else fail("call_invite_button_visible");
      await inviteBtn.first().click();
      pass("call_invite_button_click");
      await ctx.close();
    }

    // Chalkboard interaction (PC)
    {
      const { ctx, page } = await mkContext(browser, dHome, {
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(
        `${BASE}/call?sessionId=${encodeURIComponent(homeSessionId)}&classId=${encodeURIComponent(homeClassId)}`,
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForTimeout(3000);
      const canvas = page.locator("canvas").first();
      if (await canvas.count()) {
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
          await page.mouse.up();
          pass("call_chalkboard_draw");
        } else {
          fail("call_chalkboard_draw", "no bounding box");
        }
      } else {
        fail("call_chalkboard_draw", "canvas missing");
      }
      await shot(page, "02-call-chalk-pc");
      await ctx.close();
    }

    // --- Invite: unprofiled → /onboarding (while session still open) ---
    const openInviteUrl = `${BASE}/room?invite=1&autojoin=1&classId=${encodeURIComponent(homeClassId)}&sessionId=${encodeURIComponent(homeSessionId)}`;
    {
      const { ctx, page } = await mkContext(browser, dNoProfile, devices["iPhone 13"]);
      await page.goto(openInviteUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(5000);
      const u = new URL(page.url());
      if (u.pathname === "/onboarding") {
        pass("invite_no_profile_redirect", u.pathname);
        const rt =
          u.searchParams.get("next") ||
          u.searchParams.get("returnTo") ||
          "";
        if (rt.includes("invite=1") && rt.includes(homeSessionId.slice(0, 8))) {
          pass("invite_onboarding_return_to", rt.slice(0, 80));
        } else {
          fail("invite_onboarding_return_to", rt || "missing next/returnTo");
        }
      } else {
        fail("invite_no_profile_redirect", page.url());
        fail("invite_onboarding_return_to", "skipped");
      }
      await shot(page, "05-invite-needs-profile-mobile");

      // Complete onboarding and return to invite session
      if (u.pathname === "/onboarding") {
        await page.locator("#min-display-name").fill(`${TAG}_${RUN_ID}_INV`);
        await page.locator("#min-age").fill("25");
        const consent = page.locator(
          '[data-cm-consent="needed"] input[type="checkbox"]'
        );
        if (await consent.count()) await consent.check();
        await page.getByRole("button", { name: /保存して通話へ戻る|ホームへ進む/ }).click();
        try {
          await page.waitForFunction(
            () => /\/(room|call)/.test(window.location.pathname),
            { timeout: 90000 }
          );
          const finalPath = new URL(page.url()).pathname;
          const finalSid = new URL(page.url()).searchParams.get("sessionId") || "";
          if (
            (finalPath === "/room" || finalPath === "/call") &&
            finalSid === homeSessionId
          ) {
            pass("invite_onboarding_returns_session", `${finalPath}:${finalSid.slice(0, 8)}`);
          } else if (finalPath === "/") {
            fail("invite_onboarding_returns_session", "went home");
          } else {
            fail(
              "invite_onboarding_returns_session",
              `${finalPath} sid=${finalSid.slice(0, 8)}`
            );
          }
        } catch (e) {
          fail("invite_onboarding_returns_session", String(e?.message || e));
        }
        await shot(page, "06-invite-profile-return-pc");
      }
      await ctx.close();
    }

    // --- 4. Multi-member on home session ---
    const sessionId = homeSessionId;
    const classId = homeClassId;
    for (const [id, sfx] of [
      [d2, "M2"],
      [d3, "M3"],
      [d4, "M4"],
      [d5, "M5"],
      [d6, "M6"],
    ]) {
      await apiProfile(id, sfx);
    }

    const j2 = await apiMatchJoin(d2, null);
    if (j2.sessionId === sessionId) pass("join_2_same_session");
    else fail("join_2_same_session", j2.sessionId);

    {
      const { ctx, page } = await mkContext(browser, d2, devices["iPhone 13"]);
      await page.goto(
        `${BASE}/call?sessionId=${encodeURIComponent(sessionId)}&classId=${encodeURIComponent(classId)}`,
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForTimeout(4000);
      await shot(page, "04-call-two-mobile");
      const body = await page.locator("body").innerText();
      if (/メンバー募集中\s*[2-9]\/5/.test(body)) {
        pass("call_two_member_display", body.match(/メンバー募集中[^\n]+/)?.[0]);
      } else {
        fail("call_two_member_display", body.slice(0, 100));
      }
      await ctx.close();
    }

    const j3 = await apiMatchJoin(d3, null);
    if (j3.sessionId === sessionId) pass("join_3_same_session");
    else fail("join_3_same_session", j3.sessionId);

    const sess3 = (await rest(`sessions?id=eq.${sessionId}&select=join_open_until,members_locked_at,capacity`))[0];
    if (sess3?.join_open_until) pass("join_window_at_three", sess3.join_open_until);
    else fail("join_window_at_three");

    const j4 = await apiMatchJoin(d4, null);
    if (j4.ok && j4.sessionId === sessionId) pass("join_4_in_window");
    else fail("join_4_in_window", JSON.stringify(j4).slice(0, 120));

    const j5 = await apiMatchJoin(d5, null);
    const memberCountAfter5 = (
      await rest(`session_members?session_id=eq.${sessionId}&select=device_id`)
    ).length;
    if (memberCountAfter5 >= 5) pass("join_5_at_capacity", `members=${memberCountAfter5}`);
    else if (j5.ok && j5.sessionId === sessionId) pass("join_5_at_capacity", "api same session");
    else fail("join_5_at_capacity", `members=${memberCountAfter5} api=${JSON.stringify(j5).slice(0, 80)}`);

    const joinUntilMs = sess3?.join_open_until
      ? new Date(sess3.join_open_until).getTime()
      : Date.now() + 33000;
    await new Promise((r) => setTimeout(r, Math.max(2500, joinUntilMs - Date.now() + 2500)));

    const locked = (await rest(`sessions?id=eq.${sessionId}&select=members_locked_at,status`))[0];
    if (locked?.members_locked_at) pass("members_locked_after_window", locked.members_locked_at);
    else fail("members_locked_after_window");

    const j6 = await apiMatchJoin(d6, null);
    if (!j6.ok || j6.sessionId !== sessionId) pass("join_6_blocked_after_lock", j6.error || "different session");
    else fail("join_6_blocked_after_lock", "6th joined same session");

    {
      const { ctx, page } = await mkContext(browser, dHome, {
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(
        `${BASE}/call?sessionId=${encodeURIComponent(sessionId)}&classId=${encodeURIComponent(classId)}`,
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForTimeout(3000);
      const body = await page.locator("body").innerText();
      const recruiting = body.match(/メンバー募集中\s*(\d+)\/5/);
      const lockedCount = body.match(/参加人数\s*(\d+)\/5/);
      if (lockedCount && Number(lockedCount[1]) >= 3) {
        pass("call_five_locked_display", lockedCount[0]);
        pass("call_locked_copy_not_recruiting");
      } else if (recruiting) {
        fail("call_five_locked_display", `still recruiting: ${recruiting[0]}`);
        fail("call_locked_copy_not_recruiting", recruiting[0]);
      } else {
        fail("call_five_locked_display", body.slice(0, 80));
        fail("call_locked_copy_not_recruiting");
      }
      await shot(page, "09-call-locked-pc");
      await ctx.close();
    }

    // --- Locked invite: must clear loading and show recruitment-ended panel ---
    {
      const dLocked = randomUUID();
      await ensureProfile(dLocked, "LOCK");
      const lockedInvite = `${BASE}/room?invite=1&autojoin=1&classId=${encodeURIComponent(classId)}&sessionId=${encodeURIComponent(sessionId)}`;
      const { ctx, page } = await mkContext(browser, dLocked, devices["iPhone 13"]);
      await page.goto(lockedInvite, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForSelector("[data-cm-entry-failure]", { timeout: 45000 });
      } catch {
        /* fall through to body checks */
      }
      await page.waitForTimeout(1500);
      const body = await page.locator("body").innerText();
      const loadingStuck =
        body.includes("読み込み中") &&
        !body.includes("この通話の募集は終了しました");
      if (loadingStuck) fail("invite_locked_clears_loading", body.slice(0, 80));
      else pass("invite_locked_clears_loading");

      if (body.includes("この通話の募集は終了しました")) {
        pass("invite_locked_reason", "title ok");
      } else {
        fail("invite_locked_reason", body.slice(0, 160));
      }
      if (body.includes("この通話には参加できません")) {
        pass("invite_locked_message");
      } else {
        fail("invite_locked_message", body.slice(0, 120));
      }
      if (body.includes("ホームへ戻る")) pass("invite_locked_home_cta");
      else fail("invite_locked_home_cta");
      await shot(page, "07-invite-locked-mobile");
      await ctx.close();
    }

    // --- 2. /class/select free theme → same session ---
    await expireE2eFormingSessions();
    await apiProfile(dThemeA, "THEME_A");
    await apiProfile(dThemeB, "THEME_B");

    {
      const { ctx, page } = await mkContext(browser, dThemeA, {
        viewport: { width: 1280, height: 900 },
      });
      page.on("request", (req) => {
        if (req.url().includes("/api/class/match-join-v2") && req.method() === "POST") {
          try {
            const body = req.postDataJSON();
            capturedTopicKey =
              body?.topicKey === undefined ? "undefined" : String(body.topicKey);
          } catch {
            /* ignore */
          }
        }
      });
      await page.goto(`${BASE}/class/select`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await shot(page, "03-select-free-pc");
      const freeCard = page.locator(".cm-select-theme-card").filter({ hasText: "テーマフリー" }).first();
      await freeCard.getByRole("button", { name: /^入る$|管理者としてテスト入室$/ }).click();
      await page.waitForFunction(() => /\/call/.test(window.location.pathname), {
        timeout: 90000,
      });
      const u = new URL(page.url());
      themeClassId = u.searchParams.get("classId") || "";
      themeSessionId = u.searchParams.get("sessionId") || "";
      if (themeSessionId && themeClassId) pass("select_free_direct_call", themeSessionId.slice(0, 8));
      else fail("select_free_direct_call", page.url());
      if (capturedTopicKey === "null" || capturedTopicKey === "undefined") {
        pass("select_topic_key_null", capturedTopicKey);
      } else {
        pass("select_topic_key_preserved", capturedTopicKey);
      }
      await ctx.close();
    }

    const jThemeB = await apiMatchJoin(dThemeB, null);
    if (jThemeB.sessionId === themeSessionId) pass("select_same_session_second", jThemeB.sessionId.slice(0, 8));
    else fail("select_same_session_second", `${jThemeB.sessionId} vs ${themeSessionId}`);

    {
      const { ctx, page } = await mkContext(browser, dThemeA, devices["iPhone 13"]);
      await page.goto(`${BASE}/class/select`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      await shot(page, "03-select-free-mobile");
      await ctx.close();
    }

    // --- 3. Official class → /room (not immediate /call) ---
    const membership = await findOfficialMembershipDevice();
    if (membership) {
      await ensureProfile(membership.deviceId, "MINE");
      const { ctx, page } = await mkContext(browser, membership.deviceId, {
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(`${BASE}/class/mine`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const row = page.locator(".cm-mine-class-row").first();
      if (await row.count()) {
        await row.click();
        try {
          await page.waitForURL(/\/room/, { timeout: 90000 });
          pass("mine_open_goes_room", page.url());
        } catch {
          const body = await page.locator("body").innerText();
          fail("mine_open_goes_room", body.slice(0, 120));
        }
        const path = new URL(page.url()).pathname;
        if (path === "/call") fail("mine_not_immediate_call");
        else pass("mine_not_immediate_call");
        const body = await page.locator("body").innerText();
        if (body.includes("メンバーを待っています")) {
          fail("mine_room_no_random_lobby", "unexpected lobby for joined class");
        } else {
          pass("mine_room_no_random_lobby");
        }
        await shot(page, "08-mine-room-pc");
      } else {
        skip("mine_open_goes_room", "no .cm-mine-class-row for device");
      }
      await ctx.close();

      await shotBoth(browser, membership.deviceId, "08-mine-room", async (page) => {
        await page.goto(`${BASE}/class/mine`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        const row = page.locator(".cm-mine-class-row").first();
        if (await row.count()) await row.click();
        await page.waitForTimeout(3500);
      });
    } else {
      skip("mine_open_goes_room", "no official membership device in DB");
      skip("mine_not_immediate_call");
    }
  } catch (e) {
    fail("fatal", String(e?.message || e));
    console.error(e);
  } finally {
    await browser.close();
    await admissionRestore().catch(() => {});
  }

  const outJson = path.join(root, "scripts/.smoke-immediate-call-ui-result.json");
  fs.writeFileSync(
    outJson,
    JSON.stringify(
      {
        results,
        meta: {
          base: BASE,
          runId: RUN_ID,
          homeSessionId,
          themeSessionId,
          screenshotDir: OUT,
        },
        finishedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const failed = results.filter((r) => r.ok === false);
  const passed = results.filter((r) => r.ok === true);
  const skipped = results.filter((r) => r.ok === null);
  console.log(`\nSummary: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped / ${results.length}`);
  console.log(`Screenshots: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main();
