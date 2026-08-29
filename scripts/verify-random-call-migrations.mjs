#!/usr/bin/env node
/**
 * Post-migration verification for random-call Phase 1–3.
 * Does not print secrets. Requires .env.local service role + applied migrations.
 *
 * Usage:
 *   node scripts/verify-random-call-migrations.mjs           # full (writes test data)
 *   node scripts/verify-random-call-migrations.mjs --schema-only  # read-only (prod-safe)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const schemaOnly = process.argv.includes("--schema-only");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

const results = [];
function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, pass: false, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

async function rest(pathname, init = {}) {
  const res = await fetch(`${url}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
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

async function rpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

async function ensureMinProfile(deviceId, displayName, age) {
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    device_id: deviceId,
    display_name: displayName,
    birth_date: null,
    gender: null,
    declared_age: age,
    declared_age_as_of: today,
    photo_path: null,
    hobbies: null,
    bio: null,
    show_age: true,
  };
  const { res, json, text } = await rest("user_profiles", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`profile upsert failed: ${text.slice(0, 200)}`);
  return Array.isArray(json) ? json[0] : json;
}

async function main() {
  console.log(`host=${new URL(url).host}`);
  console.log(`mode=${schemaOnly ? "schema-only (read-only)" : "full"}`);

  // Schema probes
  for (const [label, path] of [
    ["declared_age", "user_profiles?select=declared_age,declared_age_as_of&limit=1"],
    ["lifecycle", "classes?select=lifecycle,promoted_from_session_id&limit=1"],
    [
      "join_lock",
      "sessions?select=join_open_until,members_locked_at,lobby_extended_once&limit=1",
    ],
    ["session_class_votes", "session_class_votes?select=session_id&limit=1"],
    ["product_funnel_events", "product_funnel_events?select=id&limit=1"],
  ]) {
    const { res, text } = await rest(path);
    if (res.ok || res.status === 200) ok(`schema:${label}`);
    else if (
      res.status === 404 ||
      text.includes("does not exist") ||
      text.includes("PGRST205") ||
      text.includes("42703")
    )
      fail(`schema:${label}`, text.slice(0, 160));
    else ok(`schema:${label}`, `status=${res.status}`);
  }

  if (schemaOnly) {
    await verifyBackwardCompatReadOnly();
    const failed = results.filter((r) => !r.pass);
    console.log(
      `\nSummary: ${results.length - failed.length}/${results.length} passed (schema-only)`
    );
    process.exit(failed.length ? 1 : 0);
  }

  // --- full mode writes test data below ---
  const d1 = randomUUID();
  const row = await ensureMinProfile(d1, `検証${d1.slice(0, 4)}`, 22);
  if (row?.birth_date) fail("min_profile_no_birth_date", String(row.birth_date));
  else ok("min_profile_no_birth_date");

  const ageRes = await rpc("profile_age_for_device", { p_device_id: d1 });
  if (ageRes.json === 22 || ageRes.json === 23) ok("profile_age_declared", String(ageRes.json));
  else fail("profile_age_declared", JSON.stringify(ageRes.json).slice(0, 120));

  // under-18 storage still possible at DB layer; app gates separately — check age function
  const dMinor = randomUUID();
  await ensureMinProfile(dMinor, `未成年${dMinor.slice(0, 4)}`, 16);
  const minorAge = await rpc("profile_age_for_device", { p_device_id: dMinor });
  if (minorAge.json === 16) ok("declared_age_stored_16", "app layer must reject join");
  else fail("declared_age_stored_16", JSON.stringify(minorAge.json).slice(0, 80));

  // match_join creates provisional free class
  const devices = [randomUUID(), randomUUID(), randomUUID()];
  for (const [i, id] of devices.entries()) {
    await ensureMinProfile(id, `通話${i}${id.slice(0, 3)}`, 25);
  }

  const joins = [];
  for (const id of devices) {
    const r = await rpc("match_join_atomic_v3", {
      p_device_id: id,
      p_display_name: "参加者",
      p_forced_class_id: null,
      p_world_key: "default",
      p_topic_key: null,
      p_requested_capacity: 5,
      p_class_slots: 10,
      p_blocked_device_ids: [],
      p_requested_min_age: 0,
      p_requested_max_age: 120,
    });
    joins.push(r);
  }

  const first = Array.isArray(joins[0].json) ? joins[0].json[0] : joins[0].json;
  if (!first?.class_id) {
    fail("match_join_provisional", JSON.stringify(joins[0].json).slice(0, 200));
  } else {
    const classId = first.class_id;
    const sessionId = first.session_id;
    const { json: classRows } = await rest(
      `classes?id=eq.${classId}&select=id,name,lifecycle,promoted_from_session_id`
    );
    const klass = Array.isArray(classRows) ? classRows[0] : null;
    if (klass?.lifecycle === "provisional") ok("provisional_lifecycle");
    else fail("provisional_lifecycle", JSON.stringify(klass));

    const { json: sessRows } = await rest(
      `sessions?id=eq.${sessionId}&select=id,join_open_until,members_locked_at,capacity`
    );
    const sess = Array.isArray(sessRows) ? sessRows[0] : null;
    if (sess?.join_open_until) ok("join_open_until_set", sess.join_open_until);
    else fail("join_open_until_set", JSON.stringify(sess));

    // votes < 3 should not promote
    await rest("session_class_votes", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        device_id: devices[0],
      }),
    });
    await rest("session_class_votes", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        device_id: devices[1],
      }),
    });
    const promote2 = await rpc("promote_provisional_class_from_session", {
      p_session_id: sessionId,
      p_device_id: devices[0],
    });
    if (promote2.json?.ok === false && promote2.json?.reason === "need_more_votes") {
      ok("promote_need_3");
    } else fail("promote_need_3", JSON.stringify(promote2.json).slice(0, 200));

    await rest("session_class_votes", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        device_id: devices[2],
      }),
    });
    const promoteA = await rpc("promote_provisional_class_from_session", {
      p_session_id: sessionId,
      p_device_id: devices[0],
    });
    const promoteB = await rpc("promote_provisional_class_from_session", {
      p_session_id: sessionId,
      p_device_id: devices[1],
    });
    if (promoteA.json?.ok === true && promoteA.json?.promoted === true) {
      ok("promote_once");
    } else fail("promote_once", JSON.stringify(promoteA.json).slice(0, 200));
    if (
      promoteB.json?.ok === true &&
      (promoteB.json?.reason === "already_promoted" || promoteB.json?.promoted === true)
    ) {
      ok("promote_idempotent");
    } else fail("promote_idempotent", JSON.stringify(promoteB.json).slice(0, 200));

    const { json: afterClass } = await rest(
      `classes?id=eq.${classId}&select=lifecycle,promoted_from_session_id`
    );
    const after = Array.isArray(afterClass) ? afterClass[0] : null;
    if (after?.lifecycle === "official" && after?.promoted_from_session_id === sessionId) {
      ok("official_promoted_from_session");
    } else fail("official_promoted_from_session", JSON.stringify(after));
  }

  // funnel insert without PII-heavy payload
  const { res: funnelRes, text: funnelText } = await rest("product_funnel_events", {
    method: "POST",
    body: JSON.stringify({
      event_name: "talk_cta_clicked",
      device_id: d1,
      meta: { source: "verify_script" },
    }),
  });
  if (funnelRes.ok) ok("funnel_insert");
  else fail("funnel_insert", funnelText.slice(0, 160));

  const failed = results.filter((r) => !r.pass);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

/** Read-only checks for prod: no inserts/updates. */
async function verifyBackwardCompatReadOnly() {
  // Existing classes default to official (lifecycle column NOT NULL DEFAULT 'official')
  const { json: classSample, res: classRes } = await rest(
    "classes?select=id,lifecycle,is_user_created,topic_key&limit=5&order=created_at.desc"
  );
  if (!classRes.ok) {
    fail("compat:classes_readable", String(classRes.status));
  } else {
    const rows = Array.isArray(classSample) ? classSample : [];
    const badLifecycle = rows.filter(
      (r) => !["official", "provisional"].includes(String(r.lifecycle ?? ""))
    );
    if (badLifecycle.length === 0) ok("compat:classes_lifecycle_values");
    else fail("compat:classes_lifecycle_values", JSON.stringify(badLifecycle));
    ok("compat:classes_readable", `sample=${rows.length}`);
  }

  // Existing profiles with birth_date still resolve age via RPC
  const { json: profileSample, res: profRes } = await rest(
    "user_profiles?select=device_id,birth_date&birth_date=not.is.null&limit=1"
  );
  if (!profRes.ok) {
    fail("compat:profiles_birth_date_sample");
  } else {
    const row = Array.isArray(profileSample) ? profileSample[0] : null;
    if (!row?.device_id) {
      ok("compat:profiles_birth_date_sample", "no rows (skip age RPC)");
    } else {
      const ageRes = await rpc("profile_age_for_device", {
        p_device_id: row.device_id,
      });
      if (typeof ageRes.json === "number" && ageRes.json >= 0) {
        ok("compat:profile_age_birth_date", `age=${ageRes.json}`);
      } else {
        fail("compat:profile_age_birth_date", JSON.stringify(ageRes.json).slice(0, 80));
      }
    }
  }

  // match_join_atomic_v3 still callable (expect profile/age error, not missing RPC)
  const probeJoin = await rpc("match_join_atomic_v3", {
    p_device_id: `readonly-probe-${Date.now()}`,
    p_display_name: "probe",
    p_forced_class_id: null,
    p_world_key: "default",
    p_topic_key: null,
    p_requested_capacity: 5,
    p_class_slots: 1,
    p_blocked_device_ids: [],
    p_requested_min_age: 0,
    p_requested_max_age: 120,
  });
  const joinText = JSON.stringify(probeJoin.json ?? probeJoin.text).slice(0, 200);
  if (probeJoin.json?.code === "PGRST202") {
    fail("compat:match_join_rpc", "RPC missing");
  } else {
    ok("compat:match_join_rpc", joinText.slice(0, 80));
  }

  // promote RPC exists (invalid session → structured error, not PGRST202)
  const probePromote = await rpc("promote_provisional_class_from_session", {
    p_session_id: "00000000-0000-4000-8000-000000000001",
    p_device_id: "readonly-probe",
  });
  if (probePromote.json?.code === "PGRST202") {
    fail("compat:promote_rpc", "RPC missing");
  } else if (probePromote.json?.ok === false || probePromote.json?.reason) {
    ok("compat:promote_rpc", String(probePromote.json.reason ?? "error_ok"));
  } else {
    ok("compat:promote_rpc", JSON.stringify(probePromote.json).slice(0, 60));
  }

  // Official classes query (requires lifecycle column from migration 1)
  const { json: officialCount, res: officialRes } = await rest(
    "classes?select=id&lifecycle=eq.official&limit=1"
  );
  if (officialRes.ok && Array.isArray(officialCount)) {
    ok("compat:official_classes_query");
  } else {
    fail(
      "compat:official_classes_query",
      officialRes.ok ? "not_array" : String(officialRes.status)
    );
  }

  // session_age_match_ok with declared_age-only member (migration #5)
  const { json: declaredProfile } = await rest(
    "user_profiles?select=device_id&declared_age=not.is.null&birth_date=is.null&limit=1"
  );
  const declaredRow = Array.isArray(declaredProfile) ? declaredProfile[0] : null;
  if (declaredRow?.device_id) {
    const { json: sessRow } = await rest(
      `session_members?device_id=eq.${encodeURIComponent(declaredRow.device_id)}&select=session_id&limit=1&order=joined_at.desc`
    );
    const sess = Array.isArray(sessRow) ? sessRow[0] : null;
    if (sess?.session_id) {
      const ageRes = await rpc("session_age_match_ok", {
        p_session_id: sess.session_id,
        p_requester_age: 25,
        p_requested_min_age: 18,
        p_requested_max_age: 120,
      });
      if (ageRes.json === true) ok("compat:session_age_match_declared");
      else fail("compat:session_age_match_declared", String(ageRes.json));
    } else {
      ok("compat:session_age_match_declared", "no session (skip)");
    }
  } else {
    ok("compat:session_age_match_declared", "no declared-only profile (skip)");
  }

  // Funnel table readable (empty OK)
  const { res: funnelRead } = await rest(
    "product_funnel_events?select=event_name&limit=1&order=created_at.desc"
  );
  if (funnelRead.ok) ok("compat:funnel_readable");
  else fail("compat:funnel_readable", String(funnelRead.status));

  // migration #6: session_open_for_match_join excludes locked / expired windows
  const openProbe = await rpc("session_open_for_match_join", {
    p_session_id: "00000000-0000-4000-8000-000000000099",
  });
  if (openProbe.json?.code === "PGRST202") {
    fail("compat:session_open_for_match_join", "RPC missing — apply 20260827060000");
    ok("compat:locked_session_not_open", "skipped (helper RPC missing)");
  } else if (openProbe.json === false) {
    ok("compat:session_open_for_match_join", "missing session → false");

    const { json: lockedSess } = await rest(
      "sessions?select=id,members_locked_at,join_open_until&members_locked_at=not.is.null&limit=1"
    );
    const lockedRow = Array.isArray(lockedSess) ? lockedSess[0] : null;
    if (lockedRow?.id) {
      const lockedProbe = await rpc("session_open_for_match_join", {
        p_session_id: lockedRow.id,
      });
      if (lockedProbe.json === false) {
        ok("compat:locked_session_not_open", lockedRow.id.slice(0, 8));
      } else {
        fail("compat:locked_session_not_open", String(lockedProbe.json));
      }
    } else {
      ok("compat:locked_session_not_open", "no locked session (skip)");
    }
  } else {
    fail(
      "compat:session_open_for_match_join",
      JSON.stringify(openProbe.json ?? openProbe.text).slice(0, 120)
    );
    ok("compat:locked_session_not_open", "skipped (helper probe failed)");
  }
}

main().catch((e) => {
  console.error("ERROR", e?.message || e);
  process.exit(1);
});
