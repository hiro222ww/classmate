#!/usr/bin/env node
/**
 * Probe match_join_atomic_v3 + gender restriction via match-join-v2 API.
 *
 * Usage: node scripts/probe-match-join-v3.mjs [--api-base https://...]
 */
import fs from "node:fs";

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

function pass(label) {
  console.log(`PASS: ${label}`);
}

function fail(label, detail) {
  console.error(`FAIL: ${label}`);
  if (detail) console.error(detail);
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

const topicsRes = await fetch(
  `${url}/rest/v1/topics?select=topic_key,title,gender_restriction&order=topic_key.asc`,
  { headers }
);
const topics = await topicsRes.json();
console.log("\n=== Topics (gender_restriction sample) ===");
console.log(
  (topics ?? []).map((t) => ({
    topic_key: t.topic_key,
    gender_restriction: t.gender_restriction,
  }))
);

const maleTopic =
  topics.find((t) => String(t.gender_restriction ?? "").trim() === "male") ??
  null;
const femaleTopic =
  topics.find((t) => String(t.gender_restriction ?? "").trim() === "female") ??
  null;
const openTopic =
  topics.find((t) => !String(t.gender_restriction ?? "").trim()) ?? topics[0] ?? null;

const freeClassesRes = await fetch(
  `${url}/rest/v1/classes?select=id,created_at&world_key=eq.default&topic_key=is.null&order=created_at.asc`,
  { headers }
);
const freeClasses = await freeClassesRes.json();
const oldFreeClassIds = new Set(
  (freeClasses ?? []).map((c) => String(c.id)).filter(Boolean)
);

console.log("\n=== Existing free class ids ===");
console.log([...oldFreeClassIds]);

const baseBody = {
  p_device_id: maleProfile.device_id,
  p_display_name: maleProfile.display_name || "Probe",
  p_world_key: "default",
  p_topic_key: null,
  p_requested_capacity: 5,
  p_class_slots: 5,
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
  console.log("session_status:", status);
  console.log("created_new_class:", row?.created_new_class);
  console.log("created_new_session:", row?.created_new_session);
  console.log("reused:", row?.reused);
  console.log("expired_count:", row?.expired_count);
  console.log("candidate_session_count:", row?.candidate_session_count);

  if (BLOCKED_STATUSES.has(status)) {
    markFail("normal match must not return active/closed/expired", status);
  } else {
    pass("normal match session status is recruiting");
  }

  if (
    oldFreeClassIds.size > 0 &&
    oldFreeClassIds.has(String(row?.class_id ?? "")) &&
    row?.created_new_class === true
  ) {
    markFail(
      "normal match created_new_class=true must return a new class_id",
      row?.class_id
    );
  } else if (
    oldFreeClassIds.size > 0 &&
    oldFreeClassIds.has(String(row?.class_id ?? "")) &&
    row?.reused === true &&
    Number(row?.candidate_session_count ?? 0) > 0
  ) {
    pass("reused existing class with fresh forming session");
  } else if (row?.created_new_class === true) {
    pass("created new class when no fresh class was reusable");
  }
} else if (normal.text.includes("created_new_class")) {
  console.log("Hint: apply 20260526190000_match_join_atomic_v3_fresh_class_only.sql");
  markFail("RPC failed", normal.text);
} else if (normal.text.includes("42883")) {
  markFail("RPC type mismatch", "apply session class_id cast migration");
} else if (normal.text.includes("23514")) {
  markFail("sessions_status_check", "apply expired status migration");
} else {
  markFail("normal RPC non-200", normal.text);
}

console.log("\n=== [2] Normal match RPC again (fresh reuse check) ===");
const normal2 = await rpcCall(url, headers, {
  ...baseBody,
  p_forced_class_id: null,
});

if (normal2.status === 200) {
  const row2 = rowFromResult(normal2.json);
  console.log("class_id:", row2?.class_id);
  console.log("reused:", row2?.reused);
  console.log("created_new_class:", row2?.created_new_class);
  console.log("candidate_session_count:", row2?.candidate_session_count);

  if (row2?.reused === true && Number(row2?.candidate_session_count ?? 0) > 0) {
    pass("second normal match reused fresh forming when available");
  } else if (row2?.created_new_class === true) {
    pass("second normal match opened another new class when fresh full/missing");
  }
} else {
  markFail("second normal RPC", normal2.text);
}

console.log("\n=== [3] Gender restriction via API ===");

if (openTopic?.topic_key) {
  const openRes = await apiMatchJoin({
    deviceId: maleProfile.device_id,
    worldKey: "default",
    topicKey: openTopic.topic_key,
    capacity: 5,
  });
  console.log("open topic:", openTopic.topic_key, openRes.status, openRes.json?.error ?? "ok");
  if (openRes.status === 200 && openRes.json?.ok) {
    pass("gender none/open topic allows join");
  } else if (openRes.json?.error === "admission_closed") {
    console.log("SKIP: admission closed");
  } else {
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
    pass("male topic allows male profile");
  } else if (maleRes.json?.error === "admission_closed") {
    console.log("SKIP: admission closed");
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
    pass("female topic blocks male profile");
  } else if (blockedRes.json?.error === "admission_closed") {
    console.log("SKIP: admission closed");
  } else {
    markFail("female topic should block male profile", JSON.stringify(blockedRes.json));
  }

  if (femaleProfile?.device_id) {
    const femaleOkRes = await apiMatchJoin({
      deviceId: femaleProfile.device_id,
      worldKey: "default",
      topicKey: femaleTopic.topic_key,
      capacity: 5,
    });
    console.log(
      "female topic + female profile:",
      femaleOkRes.status,
      femaleOkRes.json?.error ?? "ok"
    );
    if (femaleOkRes.status === 200 && femaleOkRes.json?.ok) {
      pass("female topic allows female profile");
    } else if (femaleOkRes.json?.error === "admission_closed") {
      console.log("SKIP: admission closed");
    } else {
      markFail(
        "female topic + female profile",
        JSON.stringify(femaleOkRes.json)
      );
    }
  } else {
    console.log("SKIP: no female profile in DB");
  }
} else {
  console.log("SKIP: no female-restricted topic in DB");
}

process.exit(exitCode);
