#!/usr/bin/env node
/**
 * Probe match_join_atomic_v3 + match-join-v2 behavior.
 *
 * Usage:
 *   node scripts/probe-match-join-v3.mjs
 *   node scripts/probe-match-join-v3.mjs --api-base https://your-app.vercel.app
 */
import fs from "node:fs";

const SYSTEM_CLASS_NAME_PATTERN = /^クラス\d{4}[A-Z]$/;
const BLOCKED_STATUSES = new Set(["active", "closed", "expired"]);
const args = process.argv.slice(2);
const apiBaseArgIndex = args.indexOf("--api-base");
const API_BASE =
  apiBaseArgIndex >= 0 ? args[apiBaseArgIndex + 1] : "http://localhost:3000";

function loadEnv() {
  const path = ".env.local";
  if (!fs.existsSync(path)) {
    throw new Error(".env.local not found");
  }

  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      })
  );
}

async function rpcCall(url, headers, body) {
  const res = await fetch(`${url}/rest/v1/rpc/match_join_atomic_v3`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: res.status, text, json };
}

function rowFromResult(json) {
  return Array.isArray(json) ? json[0] : json;
}

function sessionStatusFromResult(json) {
  return String(rowFromResult(json)?.session_status ?? "")
    .trim()
    .toLowerCase();
}

async function apiMatchJoin(body) {
  const res = await fetch(`${API_BASE}/api/class/match-join-v2`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function apiMine(deviceId) {
  const res = await fetch(
    `${API_BASE}/api/class/mine?deviceId=${encodeURIComponent(deviceId)}`,
    { cache: "no-store" }
  );
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function pass(label) {
  console.log(`PASS: ${label}`);
}

function fail(label, detail) {
  console.error(`FAIL: ${label}`);
  if (detail) console.error(detail);
}

function genderBlocks(restriction, profileGender) {
  const normalized = String(restriction ?? "").trim().toLowerCase();
  if (!normalized || normalized === "none") return false;
  return String(profileGender ?? "").trim().toLowerCase() !== normalized;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

console.log("Supabase URL:", url);
console.log("API base:", API_BASE);

let exitCode = 0;

function markFail(label, detail) {
  fail(label, detail);
  exitCode = 1;
}

const profilesRes = await fetch(
  `${url}/rest/v1/user_profiles?select=device_id,display_name,gender&limit=50`,
  { headers }
);
const profiles = await profilesRes.json();

const maleProfile =
  profiles.find((p) => String(p.gender ?? "").trim() === "male") ?? profiles[0];
const femaleProfile = profiles.find(
  (p) => String(p.gender ?? "").trim() === "female"
);

if (!maleProfile?.device_id) {
  console.error("No user_profiles row found for RPC probe");
  process.exit(1);
}

console.log("\n=== Probe profile (male/default) ===");
console.log(maleProfile);

const membershipsRes = await fetch(
  `${url}/rest/v1/class_memberships?select=class_id,device_id&device_id=eq.${encodeURIComponent(maleProfile.device_id)}`,
  { headers }
);
const memberships = await membershipsRes.json();
const joinedClassIds = new Set(
  (memberships ?? []).map((m) => String(m.class_id)).filter(Boolean)
);

console.log("\n=== Joined class ids ===");
console.log([...joinedClassIds]);

const topicsRes = await fetch(
  `${url}/rest/v1/topics?select=topic_key,title,gender_restriction&order=topic_key.asc`,
  { headers }
);
const topics = await topicsRes.json();

const maleTopic =
  topics.find((t) => String(t.gender_restriction ?? "").trim() === "male") ??
  null;
const femaleTopic =
  topics.find((t) => String(t.gender_restriction ?? "").trim() === "female") ??
  null;
const openTopic =
  topics.find((t) => !String(t.gender_restriction ?? "").trim()) ?? topics[0] ?? null;

const baseBody = {
  p_device_id: maleProfile.device_id,
  p_display_name: maleProfile.display_name || "Probe",
  p_world_key: "default",
  p_topic_key: null,
  p_requested_capacity: 5,
  p_class_slots: 10,
  p_blocked_device_ids: [],
};

console.log("\n=== [1] Normal match RPC (free topic) ===");
const normal = await rpcCall(url, headers, {
  ...baseBody,
  p_forced_class_id: null,
});

console.log("status:", normal.status);
console.log(normal.text);

if (normal.status === 200) {
  const row = rowFromResult(normal.json);
  const status = sessionStatusFromResult(normal.json);
  console.log("class_id:", row?.class_id);
  console.log("class_name:", row?.class_name);
  console.log("created_new_class:", row?.created_new_class);
  console.log("reused:", row?.reused);

  if (BLOCKED_STATUSES.has(status)) {
    markFail("normal match must not return active/closed/expired", status);
  } else {
    pass("normal match session status is recruiting");
  }

  if (joinedClassIds.has(String(row?.class_id ?? ""))) {
    markFail(
      "normal match must not return an already-joined class_id",
      row?.class_id
    );
  } else {
    pass("normal match did not reuse already-joined class");
  }

  if (row?.created_new_class === true) {
    if (SYSTEM_CLASS_NAME_PATTERN.test(String(row?.class_name ?? ""))) {
      pass("new class uses クラスNNNNX naming");
    } else {
      markFail(
        "new class name must match クラスNNNNX",
        row?.class_name
      );
    }
  }

  const mine = await apiMine(maleProfile.device_id);
  const mineIds = new Set(
    (mine.json?.classes ?? []).map((c) => String(c.id ?? c.class_id ?? ""))
  );

  if (mineIds.has(String(row?.class_id ?? ""))) {
    pass("match class_id appears in /api/class/mine");
  } else {
    markFail(
      "match class_id missing from /api/class/mine",
      JSON.stringify({ classId: row?.class_id, mineIds: [...mineIds] })
    );
  }
} else if (normal.text.includes("allocate_system_class_name")) {
  markFail("RPC missing allocate_system_class_name", "apply 20260526200000 migration");
} else {
  markFail("normal RPC non-200", normal.text);
}

if (joinedClassIds.size > 0) {
  const forcedClassId = [...joinedClassIds][0];
  console.log("\n=== [2] Forced RPC (openJoinedClass path) ===");
  console.log("forced class_id:", forcedClassId);

  const forced = await rpcCall(url, headers, {
    ...baseBody,
    p_forced_class_id: forcedClassId,
  });

  console.log("status:", forced.status);
  console.log(forced.text);

  if (forced.status === 200) {
    const row = rowFromResult(forced.json);
    if (String(row?.class_id ?? "") === forcedClassId) {
      pass("forced path reuses specified joined class_id");
    } else {
      markFail("forced path should keep requested class_id", row?.class_id);
    }
  } else {
    markFail("forced RPC failed", forced.text);
  }
}

console.log("\n=== [3] Gender restriction unit checks ===");
if (genderBlocks(null, "male")) markFail("null restriction should allow");
else pass("gender none/null allows join");

if (genderBlocks("none", "male")) markFail("none restriction should allow");
else pass("gender none string allows join");

if (genderBlocks("male", "male")) markFail("male restriction should allow male");
else pass("male restriction allows male profile");

if (!genderBlocks("female", "male")) markFail("female restriction should block male");
else pass("female restriction blocks male profile");

console.log("\n=== [4] Gender restriction via API (when slots allow) ===");
if (openTopic?.topic_key) {
  const openRes = await apiMatchJoin({
    deviceId: maleProfile.device_id,
    worldKey: "default",
    topicKey: openTopic.topic_key,
    capacity: 5,
  });
  console.log("open topic:", openTopic.topic_key, openRes.status, openRes.json?.error ?? "ok");
  if (openRes.status === 200 && openRes.json?.ok) {
    pass("open topic join via API");
  } else if (openRes.json?.error === "admission_closed") {
    console.log("SKIP: admission closed");
  } else if (openRes.json?.error !== "class_slots_limit") {
    markFail("open topic join", JSON.stringify(openRes.json));
  }
}

if (maleTopic?.topic_key) {
  const maleRes = await apiMatchJoin({
    deviceId: maleProfile.device_id,
    worldKey: "default",
    topicKey: maleTopic.topic_key,
    capacity: 5,
  });
  console.log("male topic:", maleTopic.topic_key, maleRes.status, maleRes.json?.error ?? "ok");
  if (maleRes.status === 200 && maleRes.json?.ok) {
    if (SYSTEM_CLASS_NAME_PATTERN.test(String(maleRes.json?.className ?? ""))) {
      pass("male topic join returns system class name");
    }
    pass("male topic allows male profile via API");
  } else if (maleRes.json?.error === "admission_closed") {
    console.log("SKIP: admission closed");
  } else if (maleRes.json?.error === "class_slots_limit") {
    console.log("SKIP: class_slots_limit");
  } else {
    markFail("male topic + male profile", JSON.stringify(maleRes.json));
  }
}

if (femaleTopic?.topic_key) {
  const blockedRes = await apiMatchJoin({
    deviceId: maleProfile.device_id,
    worldKey: "default",
    topicKey: femaleTopic.topic_key,
    capacity: 5,
  });
  console.log(
    "female topic + male profile:",
    blockedRes.status,
    blockedRes.json?.error ?? "ok"
  );
  if (blockedRes.json?.error === "gender_restricted_topic") {
    pass("female topic blocks male profile via API");
  } else if (blockedRes.json?.error === "admission_closed") {
    console.log("SKIP: admission closed");
  } else if (blockedRes.json?.error === "class_slots_limit") {
    console.log("SKIP: class_slots_limit (gender not reached)");
  } else {
    markFail("female topic should block male profile", JSON.stringify(blockedRes.json));
  }
}

process.exit(exitCode);
