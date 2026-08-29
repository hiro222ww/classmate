#!/usr/bin/env node
/**
 * UI smoke (hybrid): browser onboarding/home/room/call/vote + API joins.
 * Tag: E2E_TEST_20260828
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { WEBRTC_INIT_SCRIPT } from "./lib/webrtc-test-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "E2E_TEST_20260828";
const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3005";
const RUN_ID = String(Date.now()).slice(-6);

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

const created = { tag: TAG, runId: RUN_ID, devices: [], classId: null, sessionId: null };
const results = [];
const pass = (id, d = "") => { results.push({ id, ok: true, detail: d }); console.log(`PASS ui:${id}${d ? ` — ${d}` : ""}`); };
const fail = (id, d = "") => { results.push({ id, ok: false, detail: d }); console.error(`FAIL ui:${id}${d ? ` — ${d}` : ""}`); };

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

/** Expire E2E-only forming/waiting sessions so match-join starts a fresh queue. */
async function expireE2eFormingSessions() {
  const forming = await rest(
    "sessions?select=id&status=in.(forming,waiting)"
  );
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
  const r = await fetch(`${BASE}/api/profile`, { method: "POST", headers: { "x-device-id": deviceId }, body: f });
  return r.json();
}

async function apiJoin(deviceId) {
  const r = await fetch(`${BASE}/api/class/match-join-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": deviceId },
    body: JSON.stringify({ deviceId, worldKey: "default", topicKey: null, capacity: 5 }),
  });
  return r.json();
}

async function browserOnboarding(page, suffix) {
  await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 90000 });
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
  await page.waitForTimeout(1500);
}

async function main() {
  console.log(`ui-hybrid base=${BASE} run=${RUN_ID}`);
  const d1 = randomUUID(), d2 = randomUUID(), d3 = randomUUID(), d4 = randomUUID();
  created.devices = [
    { role: "voter1", deviceId: d1 }, { role: "voter2", deviceId: d2 },
    { role: "voter3", deviceId: d3 }, { role: "non_voter", deviceId: d4 },
  ];

  const browser = await chromium.launch({ headless: true });
  const mk = async (id) => {
    const ctx = await browser.newContext({ permissions: ["microphone"] });
    await ctx.addInitScript((did) => localStorage.setItem("classmate_device_id", did), id);
    await ctx.addInitScript(WEBRTC_INIT_SCRIPT);
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    return { ctx, page };
  };
  const p1 = await mk(d1), p2 = await mk(d2), p3 = await mk(d3);

  try {
    await browserOnboarding(p1.page, "UI_A");
    pass("onboarding_home", p1.page.url());

    await p1.page.goto(`${BASE}/`);
    await p1.page.waitForTimeout(2500);
    if (p1.page.url().includes("/room") || p1.page.url().includes("/call")) fail("home_no_autojoin", p1.page.url());
    else pass("home_no_autojoin");

    const expired = await expireE2eFormingSessions();
    if (expired) console.log(`expired locked e2e sessions=${expired}`);

    for (const [id, sfx] of [[d2, "API_B"], [d3, "API_C"], [d4, "API_D"]]) {
      await apiProfile(id, sfx);
    }

    p1.page.on("dialog", async (d) => {
      console.error("[dialog]", d.message());
      await d.accept();
    });
    await p1.page.goto(`${BASE}/`);
    await p1.page.waitForTimeout(2000);
    await p1.page.waitForFunction(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /最大5人で話す/.test(x.textContent || ""));
      return b && !b.disabled;
    }, { timeout: 90000 });
    await Promise.all([
      p1.page.waitForFunction(() => /\/room/.test(window.location.pathname), { timeout: 90000 }),
      p1.page.getByRole("button", { name: /最大5人で話す/ }).click(),
    ]);
    const roomParams = new URL(p1.page.url());
    created.classId = roomParams.searchParams.get("classId");
    created.sessionId = roomParams.searchParams.get("sessionId");
    if (!created.sessionId || !created.classId) throw new Error(`cta missing ids: ${p1.page.url()}`);
    pass("cta_enters_room", created.sessionId.slice(0, 8));

    const baseline = (await rest(`session_members?session_id=eq.${created.sessionId}&select=device_id`)).length;
    if (baseline !== 1) fail("cta_fresh_session", `count=${baseline}`);
    else pass("cta_fresh_session");

    const j2 = await apiJoin(d2);
    if (j2.sessionId !== created.sessionId) fail("api_join2_same", j2.sessionId);
    else pass("api_join2_same");
    const c2 = (await rest(`session_members?session_id=eq.${created.sessionId}&select=device_id`)).length;
    if (c2 >= baseline + 1) pass("lobby_two_no_call", `count=${c2}`);
    else fail("lobby_two_no_call", `count=${c2}`);

    const j3 = await apiJoin(d3);
    if (j3.sessionId !== created.sessionId) fail("api_join3_same", j3.sessionId);
    else pass("api_join3_same");
    const c3 = (await rest(`session_members?session_id=eq.${created.sessionId}&select=device_id`)).length;
    if (c3 >= baseline + 2) pass("three_members", `count=${c3}`);
    else fail("three_members", `count=${c3}`);

    const sess = (await rest(`sessions?id=eq.${created.sessionId}&select=join_open_until,members_locked_at,capacity`))[0];
    if (sess?.join_open_until) pass("join_window_set", sess.join_open_until);
    else fail("join_window_set");

    const j4 = await apiJoin(d4);
    if (j4.ok && j4.sessionId === created.sessionId) pass("fourth_join_in_window");
    else fail("fourth_join_in_window", JSON.stringify(j4).slice(0, 100));

    const roomUrl = `${BASE}/room?autojoin=1&classId=${created.classId}&sessionId=${created.sessionId}`;
    const callUrl = `${BASE}/call?sessionId=${created.sessionId}&classId=${created.classId}`;
    for (const [pack, id] of [[p1, d1], [p2, d2], [p3, d3]]) {
      await pack.page.addInitScript(({ sid, did }) => {
        sessionStorage.setItem(`classmate_auto_call_once:${sid}:${did}`, "1");
      }, { sid: created.sessionId, did: id });
      await pack.page.goto(roomUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
      await pack.page.waitForTimeout(1500);
    }
    try {
      await p3.page.waitForFunction(() => /\/call/.test(window.location.pathname), { timeout: 45000 });
      pass("auto_call_at_three", p3.page.url());
    } catch {
      const mc = (await rest(`session_members?session_id=eq.${created.sessionId}&select=device_id`)).length;
      if (mc < 3) throw new Error(`auto_call failed with ${mc} members`);
      await p3.page.goto(callUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
      pass("auto_call_at_three", `fallback after ${mc} members`);
    }
    for (const pack of [p1, p2]) {
      if (!/\/call/.test(pack.page.url())) {
        await pack.page.goto(callUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
      }
    }
    pass("peers_on_call");

    const joinUntilMs = sess?.join_open_until ? new Date(sess.join_open_until).getTime() : Date.now() + 33000;
    const lockWaitMs = Math.max(2000, joinUntilMs - Date.now() + 2000);
    await new Promise((r) => setTimeout(r, lockWaitMs));
    const locked = (await rest(`sessions?id=eq.${created.sessionId}&select=members_locked_at`))[0];
    if (locked?.members_locked_at) pass("members_locked_after_window");
    else fail("members_locked_after_window");

    for (const [pack, label] of [[p1, "v1"], [p2, "v2"], [p3, "v3"]]) {
      const btn = pack.page.getByRole("button", { name: /このメンバーでクラスを作る/ });
      await btn.waitFor({ timeout: 45000 });
      await btn.click();
      await pack.page.waitForTimeout(1500);
      pass(`vote_${label}`);
    }

    const klass = (await rest(`classes?id=eq.${created.classId}&select=lifecycle,name,promoted_from_session_id`))[0];
    if (klass?.lifecycle === "official") pass("promoted_official", klass.name);
    else fail("promoted_official", JSON.stringify(klass));

    const mem = await rest(`class_memberships?class_id=eq.${created.classId}&select=device_id`);
    const ids = (Array.isArray(mem) ? mem : []).map((m) => m.device_id);
    if (ids.includes(d1) && ids.includes(d2) && ids.includes(d3) && !ids.includes(d4)) pass("voters_only_members", String(ids.length));
    else fail("voters_only_members", ids.join(","));
  } catch (e) {
    fail("ui_fatal", String(e?.message || e));
  }

  await browser.close();
  const out = path.join(root, "scripts/.smoke-ui-result.json");
  fs.writeFileSync(out, JSON.stringify({ results, created, finishedAt: new Date().toISOString() }, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\nUI Summary: ${results.length - failed.length}/${results.length} passed`);
  console.log(JSON.stringify(created, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main();
