#!/usr/bin/env node
/**
 * Limited smoke test against local dev server + production Supabase.
 * Writes test data tagged E2E_TEST_20260828 — does NOT delete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const TAG = "E2E_TEST_20260828";
const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

function loadEnv() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) throw new Error(".env.local not found");
  return Object.fromEntries(
    fs
      .readFileSync(p, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      })
  );
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const results = [];
const created = {
  tag: TAG,
  devices: [],
  classId: null,
  sessionId: null,
  profileDeviceIds: [],
  voteDeviceIds: [],
  nonVoterDeviceId: null,
  funnelEventIds: [],
};

function pass(id, detail = "") {
  results.push({ id, ok: true, detail });
  console.log(`PASS ${id}${detail ? ` — ${detail}` : ""}`);
}
function fail(id, detail = "") {
  results.push({ id, ok: false, detail });
  console.error(`FAIL ${id}${detail ? ` — ${detail}` : ""}`);
}

async function api(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 300) };
  }
  return { res, json, text };
}

async function rest(pathname, init = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: init.prefer || "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json, text };
}

async function expireE2eFormingSessions() {
  const { json: forming } = await rest(
    "sessions?select=id&status=in.(forming,waiting)"
  );
  const rows = Array.isArray(forming) ? forming : [];
  let expired = 0;
  for (const row of rows) {
    const { json: members } = await rest(
      `session_members?session_id=eq.${row.id}&select=display_name`
    );
    const list = Array.isArray(members) ? members : [];
    if (list.length === 0) continue;
    if (!list.every((m) => String(m.display_name || "").startsWith(TAG))) continue;
    await rest(`sessions?id=eq.${row.id}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ status: "expired" }),
    });
    expired++;
  }
  return expired;
}

function deviceLabel(suffix) {
  return `${TAG}_${suffix}`;
}

async function saveMinProfile(deviceId, suffix) {
  const form = new FormData();
  form.append("mode", "minimum");
  form.append("device_id", deviceId);
  form.append("display_name", deviceLabel(suffix));
  form.append("declared_age", "25");
  form.append("terms_agreed", "true");
  form.append("privacy_agreed", "true");
  form.append("guidelines_agreed", "true");

  const { res, json } = await api("/api/profile", {
    method: "POST",
    headers: { "x-device-id": deviceId },
    body: form,
  });
  return { res, json };
}

async function matchJoin(deviceId) {
  return api("/api/class/match-join-v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": deviceId,
    },
    body: JSON.stringify({
      deviceId,
      worldKey: "default",
      topicKey: null,
      capacity: 5,
    }),
  });
}

async function dbSessionMembers(sessionId) {
  const { json } = await rest(
    `session_members?session_id=eq.${sessionId}&select=device_id,display_name`
  );
  return Array.isArray(json) ? json : [];
}

async function sessionStatus(sessionId, classId, viewerDeviceId) {
  return api(
    `/api/session/status?sessionId=${sessionId}&classId=${classId}&viewerDeviceId=${viewerDeviceId}`
  );
}

async function classMine(deviceId, debug = false) {
  const q = debug ? "&debugMemberships=1" : "";
  return api(`/api/class/mine?deviceId=${deviceId}${q}`, {
    headers: { "x-device-id": deviceId },
  });
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function dbSession(sessionId) {
  const { json } = await rest(
    `sessions?id=eq.${sessionId}&select=id,class_id,join_open_until,members_locked_at,status,capacity`
  );
  return Array.isArray(json) ? json[0] : null;
}

async function dbClass(classId) {
  const { json } = await rest(
    `classes?id=eq.${classId}&select=id,name,lifecycle,promoted_from_session_id,is_user_created,topic_key`
  );
  return Array.isArray(json) ? json[0] : null;
}

async function dbMemberships(classId) {
  const { json } = await rest(
    `class_memberships?class_id=eq.${classId}&select=device_id,joined_at`
  );
  return Array.isArray(json) ? json : [];
}

async function dbFunnel(deviceId) {
  const { json } = await rest(
    `product_funnel_events?device_id=eq.${deviceId}&select=id,event_name,created_at&order=created_at.desc&limit=20`
  );
  return Array.isArray(json) ? json : [];
}

async function runBrowserSmoke({ d1, sessionId, classId }) {
  const outFile = path.join(root, "scripts/.smoke-browser-result.json");
  const script = `
const { chromium } = require('@playwright/test');
const fs = require('fs');
const BASE = ${JSON.stringify(BASE)};
const TAG = ${JSON.stringify(TAG)};
const d1 = ${JSON.stringify(d1)};
const sessionId = ${JSON.stringify(sessionId)};
const classId = ${JSON.stringify(classId)};
const out = ${JSON.stringify(outFile)};

(async () => {
  const report = { steps: [], errors: [] };
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  async function step(name, fn) {
    try {
      const detail = await fn();
      report.steps.push({ name, ok: true, detail });
    } catch (e) {
      report.steps.push({ name, ok: false, detail: String(e?.message || e) });
      report.errors.push(String(e?.message || e));
    }
  }

  await step('onboarding_redirect_without_profile', async () => {
    const freshId = crypto.randomUUID();
    await page.addInitScript((id) => {
      localStorage.setItem('classmate_device_id', id);
    }, freshId);
    await page.goto(BASE + '/onboarding', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    const url = page.url();
    if (!url.includes('/onboarding')) throw new Error('expected onboarding page, got ' + url);
    return { url };
  });

  await step('onboarding_save_home', async () => {
    const freshId = crypto.randomUUID();
    await page.addInitScript((id) => {
      localStorage.setItem('classmate_device_id', id);
    }, freshId);
    await page.goto(BASE + '/onboarding', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('#min-display-name').fill(TAG + '_UI');
    await page.locator('#min-age').fill('25');
    const consent = page.locator('[data-cm-consent="needed"] input[type="checkbox"]');
    if (await consent.count()) await consent.check();
    const submit = page.getByRole('button', { name: /ホームへ進む/ });
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /ホームへ進む/.test(b.textContent || '')
      );
      return btn && !btn.disabled;
    }, { timeout: 30000 });
    await submit.click();
    await page.waitForFunction(
      () => window.location.pathname === '/' || window.location.pathname === '',
      { timeout: 30000 }
    );
    return { url: page.url(), deviceId: freshId };
  });

  await step('home_no_autojoin_without_cta', async () => {
    await page.addInitScript((id) => {
      localStorage.setItem('classmate_device_id', id);
    }, d1);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const url = page.url();
    if (url.includes('/room') || url.includes('/call')) {
      throw new Error('home should not auto-enter room/call: ' + url);
    }
    return { url };
  });

  await step('cta_enters_room', async () => {
    await page.addInitScript((id) => {
      localStorage.setItem('classmate_device_id', id);
    }, d1);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const btn = page.getByRole('button', { name: /最大5人で話す/ });
    await btn.waitFor({ timeout: 15000 });
    await btn.click();
    await page.waitForFunction(() => /\\/call/.test(window.location.pathname), { timeout: 90000 });
    const url = page.url();
    if (!url.includes('sessionId=') || !url.includes('/call')) {
      throw new Error('expected call url after CTA: ' + url);
    }
    return { url };
  });

  await step('auto_call_at_three', async () => {
    await page.addInitScript(({ id, sid, cid }) => {
      localStorage.setItem('classmate_device_id', id);
      sessionStorage.setItem('classmate_auto_call_once:' + sid + ':' + id, '1');
    }, { id: d1, sid: sessionId, cid: classId });
    await page.goto(
      BASE + '/call?classId=' + classId + '&sessionId=' + sessionId,
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    );
    await page.waitForTimeout(3000);
    const url = page.url();
    if (!url.includes('/call')) {
      throw new Error('expected stay on /call, still at ' + url);
    }
    return { url };
  });

  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.errors.length ? 1 : 0);
})().catch((e) => {
  fs.writeFileSync(out, JSON.stringify({ fatal: String(e?.message || e) }, null, 2));
  process.exit(1);
});
`;

  const tmp = path.join(root, "scripts/.smoke-browser-run.cjs");
  fs.writeFileSync(tmp, script);
  const r = spawnSync("node", [tmp], { cwd: root, stdio: "inherit", timeout: 180000 });
  let browserReport = null;
  if (fs.existsSync(outFile)) {
    browserReport = JSON.parse(fs.readFileSync(outFile, "utf8"));
  }
  return { code: r.status ?? 1, browserReport };
}

async function main() {
  console.log(`base=${BASE}`);
  console.log(`supabase=${new URL(supabaseUrl).host}`);
  console.log(`tag=${TAG}`);

  // Health
  const health = await api("/api/admission/status");
  if (!health.res.ok || health.json?.ok !== true) {
    fail("health", "admission/status unavailable");
    process.exit(1);
  }
  pass("health", `admissionOpen=${health.json.open}`);

  const d1 = randomUUID();
  const d2 = randomUUID();
  const d3 = randomUUID();
  const d4 = randomUUID(); // joins but won't vote
  created.devices = [
    { role: "voter1", deviceId: d1 },
    { role: "voter2", deviceId: d2 },
    { role: "voter3", deviceId: d3 },
    { role: "non_voter", deviceId: d4 },
  ];

  // 1. Min profile onboarding via API
  for (const [id, suffix] of [
    [d1, "A"],
    [d2, "B"],
    [d3, "C"],
    [d4, "D"],
  ]) {
    const { res, json } = await saveMinProfile(id, suffix);
    if (!res.ok || !json?.ok || !json?.profile?.minimum_profile) {
      fail("1_min_profile", `${suffix}: ${JSON.stringify(json).slice(0, 120)}`);
      process.exit(1);
    }
    created.profileDeviceIds.push(id);
  }
  pass("1_min_profile", `saved ${created.profileDeviceIds.length} profiles`);

  // 2. GET profile + home would show (API proxy for home gate)
  const prof = await api(`/api/profile?device_id=${d1}`, {
    headers: { "x-device-id": d1 },
  });
  if (prof.json?.profile?.minimum_profile !== true) {
    fail("2_home_ready", "minimum_profile false after save");
  } else {
    pass("2_home_ready", "minimum_profile=true");
  }

  const expiredLocked = await expireE2eFormingSessions();
  if (expiredLocked) console.log(`expired e2e forming sessions=${expiredLocked}`);

  // Pre-flight: declared_age users must pass session_age_match_ok for merge
  const preflightJoin = await matchJoin(d1);
  if (!preflightJoin.json?.ok || !preflightJoin.json.sessionId) {
    fail("preflight_join", JSON.stringify(preflightJoin.json).slice(0, 160));
    process.exit(1);
  }
  const preSession = preflightJoin.json.sessionId;
  const preRes = await fetch(`${supabaseUrl}/rest/v1/rpc/session_age_match_ok`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_session_id: preSession,
      p_requester_age: 25,
      p_requested_min_age: 18,
      p_requested_max_age: 120,
    }),
  });
  const preAgeOk = await preRes.json();
  if (preAgeOk !== true) {
    fail(
      "preflight_age_match",
      "session_age_match_ok=false for declared_age member — apply 20260827050000_session_age_match_declared_age.sql"
    );
    console.error(
      "BLOCKED: min-profile random-call merge requires migration #5 on prod DB."
    );
    process.exit(2);
  }
  pass("preflight_age_match");

  // Fresh run devices (d1 already joined above — reuse as voter1)
  created.classId = preflightJoin.json.classId;
  created.sessionId = preflightJoin.json.sessionId;

  let members1 = await dbSessionMembers(created.sessionId);
  const baseline = members1.length;
  if (baseline < 1) fail("4_one_member", `dbCount=${baseline}`);
  else pass("4_one_member", `dbCount=${baseline}`);

  let db1 = await dbSession(created.sessionId);
  if (db1?.join_open_until) fail("4_no_lock_at_one", db1.join_open_until);
  else pass("4_no_lock_at_one");

  const j2 = await matchJoin(d2);
  if (!j2.json?.ok || j2.json.sessionId !== created.sessionId) {
    fail(
      "5_join_d2_same_session",
      JSON.stringify({
        ok: j2.json?.ok,
        sessionId: j2.json?.sessionId,
        expected: created.sessionId,
        error: j2.json?.error,
      }).slice(0, 200)
    );
  } else pass("5_join_d2_same_session");
  let members2 = await dbSessionMembers(created.sessionId);
  if (members2.length !== baseline + 1) fail("4_two_members", `dbCount=${members2.length} expected=${baseline + 1}`);
  else pass("4_two_members", `dbCount=${members2.length}`);

  let db2 = await dbSession(created.sessionId);
  if (members2.length >= 3 && db2?.join_open_until) {
    fail("4_no_lock_at_two", db2.join_open_until);
  } else if (members2.length < 3 && db2?.join_open_until) {
    fail("4_no_lock_at_two", db2.join_open_until);
  } else {
    pass("4_no_lock_at_two");
  }

  const j3 = await matchJoin(d3);
  if (!j3.json?.ok || j3.json.sessionId !== created.sessionId) {
    fail("5_join_d3_same_session", JSON.stringify(j3.json).slice(0, 160));
  } else pass("5_join_d3_same_session");
  let members3 = await dbSessionMembers(created.sessionId);
  if (members3.length < baseline + 2) fail("5_three_members", `dbCount=${members3.length}`);
  else pass("5_three_members", `dbCount=${members3.length}`);

  const st3 = await sessionStatus(created.sessionId, created.classId, d3);
  if (!st3.res.ok) {
    fail("5_status_three_members", `http=${st3.res.status} ${st3.text?.slice(0, 80)}`);
  } else if ((st3.json?.memberCount ?? 0) < baseline + 2) {
    fail("5_status_three_members", `apiCount=${st3.json?.memberCount}`);
  } else {
    pass("5_status_three_members", `apiCount=${st3.json.memberCount}`);
  }

  await sleep(1500);
  let db3 = await dbSession(created.sessionId);
  if (!db3?.join_open_until) {
    fail("5_join_window_set", "join_open_until missing after 3rd join");
  } else {
    const openMs = new Date(db3.join_open_until).getTime() - Date.now();
    if (openMs < 5000 || openMs > 45000) {
      fail("5_join_window_30s", `remainingMs=${openMs}`);
    } else {
      pass("5_join_window_30s", `join_open_until in ~${Math.round(openMs / 1000)}s`);
    }
  }

  // 4th join within window
  const j4 = await matchJoin(d4);
  if (!j4.json?.ok || j4.json.sessionId !== created.sessionId) {
    fail("5_fourth_join_window", JSON.stringify(j4.json).slice(0, 160));
  } else {
    const members4 = await dbSessionMembers(created.sessionId);
    if (members4.length >= 4) pass("5_fourth_join_window", "4th joined within window");
    else fail("5_fourth_join_window", `dbCount=${members4.length}`);
  }

  // 6. Provisional not in mine / no slot consumption
  const mineBefore = await classMine(d1, true);
  const visibleIds = (mineBefore.json?.classes ?? []).map((c) => c.id);
  const excluded = mineBefore.json?.debug?.visibility?.excludedReasons ?? {};
  const klass = await dbClass(created.classId);
  if (klass?.lifecycle !== "provisional") {
    fail("6_provisional_lifecycle", JSON.stringify(klass));
  } else if (visibleIds.includes(created.classId)) {
    fail("6_hidden_from_mine", "provisional class visible on home");
  } else if (excluded[created.classId] !== "provisional_class") {
    fail("6_excluded_reason", JSON.stringify(excluded));
  } else {
    pass("6_provisional_hidden", `lifecycle=provisional, excluded=${excluded[created.classId]}`);
  }

  const slotsBefore = mineBefore.json?.classSlots ?? mineBefore.json?.slotCount;
  pass("6_slots_snapshot", `classSlots=${slotsBefore ?? "n/a"}`);

  // Wait for lock then vote
  await sleep(32000);
  const voteStatus = await api(
    `/api/session/class-vote-status?sessionId=${created.sessionId}&deviceId=${d1}`
  );
  if (!voteStatus.json?.membersLocked) {
    fail("7_members_locked", JSON.stringify(voteStatus.json).slice(0, 160));
  } else {
    pass("7_members_locked");
  }

  // 7–8. Votes: only d1,d2,d3 vote (d4 does not)
  const voteResults = [];
  for (const id of [d1, d2, d3]) {
    const vr = await api("/api/session/class-vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.sessionId,
        deviceId: id,
        classId: created.classId,
      }),
    });
    voteResults.push(vr.json);
    if (id === d3 && vr.json?.promoted !== true) {
      fail("7_promote_at_third_vote", JSON.stringify(vr.json).slice(0, 200));
    }
  }
  created.voteDeviceIds = [d1, d2, d3];
  created.nonVoterDeviceId = d4;

  const afterClass = await dbClass(created.classId);
  if (afterClass?.lifecycle !== "official" || afterClass?.promoted_from_session_id !== created.sessionId) {
    fail("7_official_promoted", JSON.stringify(afterClass));
  } else {
    pass("7_official_promoted", `name=${afterClass.name}`);
  }

  // Idempotent re-promote
  const rePromote = await fetch(`${supabaseUrl}/rest/v1/rpc/promote_provisional_class_from_session`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_session_id: created.sessionId,
      p_device_id: d1,
    }),
  }).then((r) => r.json());
  if (rePromote?.reason !== "already_promoted" && rePromote?.promoted !== true) {
    fail("7_idempotent_promote", JSON.stringify(rePromote).slice(0, 120));
  } else {
    pass("7_idempotent_promote", rePromote.reason);
  }

  const memberships = await dbMemberships(created.classId);
  const memberDeviceIds = memberships.map((m) => m.device_id);
  if (!memberDeviceIds.includes(d1) || !memberDeviceIds.includes(d2) || !memberDeviceIds.includes(d3)) {
    fail("8_voters_members", memberDeviceIds.join(","));
  } else if (memberDeviceIds.includes(d4)) {
    fail("8_non_voter_excluded", "d4 still member");
  } else {
    pass("8_voters_only", `members=${memberDeviceIds.length}`);
  }

  // 9. Funnel events
  await api("/api/funnel-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "talk_cta_clicked",
      deviceId: d1,
      sessionId: created.sessionId,
      classId: created.classId,
      meta: { source: TAG },
    }),
  });
  const funnel = await dbFunnel(d1);
  const eventNames = funnel.map((e) => e.event_name);
  created.funnelEventIds = funnel.map((e) => e.id);
  if (eventNames.includes("talk_cta_clicked") || funnel.length > 0) {
    pass("9_funnel_events", `events=${eventNames.slice(0, 5).join(",")}`);
  } else {
    fail("9_funnel_events", "no rows for d1");
  }

  // 10. Existing class flow — read-only regression on prod data
  const { json: officialSample } = await rest(
    "classes?select=id,lifecycle&lifecycle=eq.official&is_user_created=eq.true&limit=1"
  );
  if (Array.isArray(officialSample) && officialSample[0]?.id) {
    pass("10_existing_official_classes", `sample=${officialSample[0].id}`);
  } else {
    pass("10_existing_official_classes", "no user-created sample (skip)");
  }

  const selectPage = await api("/class/select");
  if (selectPage.res.status === 200 || selectPage.res.status === 307) {
    pass("10_select_route", `status=${selectPage.res.status}`);
  } else {
    fail("10_select_route", `status=${selectPage.res.status}`);
  }

  const mineExisting = await classMine(d1, false);
  if (mineExisting.json?.ok === true) {
    pass("10_class_mine_ok", `classes=${(mineExisting.json.classes ?? []).length}`);
  } else {
    fail("10_class_mine_ok", JSON.stringify(mineExisting.json).slice(0, 120));
  }

  // Browser UI smoke (1–3, auto-call)
  console.log("\n--- Browser smoke ---");
  const browser = await runBrowserSmoke({
    d1,
    sessionId: created.sessionId,
    classId: created.classId,
  });
  if (browser.browserReport?.steps) {
    for (const step of browser.browserReport.steps) {
      if (step.ok) pass(`browser:${step.name}`, String(step.detail?.url ?? step.detail ?? ""));
      else fail(`browser:${step.name}`, step.detail);
    }
  } else if (browser.code !== 0) {
    fail("browser_smoke", browser.browserReport?.fatal ?? "browser run failed");
  }

  const outPath = path.join(root, "scripts/.smoke-random-call-prod-result.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ results, created, finishedAt: new Date().toISOString() }, null, 2)
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  console.log(`Created data written: ${outPath}`);
  console.log(JSON.stringify(created, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e?.message || e);
  process.exit(1);
});
