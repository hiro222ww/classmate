#!/usr/bin/env node
/**
 * Probe match_join_atomic_v3 on Supabase.
 * Verifies normal match (p_forced_class_id null) does not return active/closed/expired sessions.
 *
 * Usage: node scripts/probe-match-join-v3.mjs
 */
import fs from "node:fs";

const BLOCKED_STATUSES = new Set(["active", "closed", "expired"]);

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

function sessionStatusFromResult(json) {
  const row = Array.isArray(json) ? json[0] : json;
  return String(row?.session_status ?? "")
    .trim()
    .toLowerCase();
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

const profileRes = await fetch(
  `${url}/rest/v1/user_profiles?select=device_id,display_name&limit=1`,
  { headers }
);
const profiles = await profileRes.json();
const profile = profiles?.[0];

if (!profile?.device_id) {
  console.error("No user_profiles row found for RPC probe");
  process.exit(1);
}

console.log("\n=== Probe profile ===");
console.log(profile);

const membershipsRes = await fetch(
  `${url}/rest/v1/class_memberships?select=class_id,device_id&device_id=eq.${encodeURIComponent(profile.device_id)}&limit=20`,
  { headers }
);
const memberships = await membershipsRes.json();
console.log("\n=== Memberships ===");
console.log(memberships);

let oldActiveClassId = null;

if (memberships.length > 0) {
  const classIds = memberships.map((m) => m.class_id).join(",");
  const sessionsRes = await fetch(
    `${url}/rest/v1/sessions?select=id,class_id,status&class_id=in.(${classIds})&status=eq.active&limit=5`,
    { headers }
  );
  const activeSessions = await sessionsRes.json();
  console.log("\n=== Active sessions in joined classes ===");
  console.log(activeSessions);

  if (activeSessions?.[0]?.class_id) {
    oldActiveClassId = activeSessions[0].class_id;
  }
}

const baseBody = {
  p_device_id: profile.device_id,
  p_display_name: profile.display_name || "Probe",
  p_world_key: "default",
  p_topic_key: null,
  p_requested_capacity: 5,
  p_class_slots: 5,
  p_blocked_device_ids: [],
};

console.log("\n=== Normal match RPC (p_forced_class_id null) ===");
const normal = await rpcCall(url, headers, {
  ...baseBody,
  p_forced_class_id: null,
});
console.log("status:", normal.status);
console.log(normal.text);

let exitCode = 0;

if (normal.status === 200) {
  const status = sessionStatusFromResult(normal.json);
  console.log("\nNormal match session_status:", status);

  if (BLOCKED_STATUSES.has(status)) {
    console.error(
      "FAIL: normal match returned blocked session status:",
      status
    );
    console.error(
      "Apply supabase/migrations/20260526150000_match_join_atomic_v3_normal_match_fresh.sql"
    );
    exitCode = 1;
  } else {
    console.log("PASS: normal match did not return active/closed/expired");
  }
} else if (normal.text.includes("42883")) {
  console.error(
    "Hint: apply 20260526140000_match_join_atomic_v3_fix_session_class_id_cast.sql"
  );
  exitCode = 1;
} else if (normal.text.includes("42702")) {
  console.error(
    "Hint: apply 20260526130000_match_join_atomic_v3_fix_ambiguous.sql"
  );
  exitCode = 1;
} else {
  console.log(
    "Normal match returned non-200 (may be business error):",
    normal.json?.message ?? normal.json?.error ?? normal.text
  );
}

if (oldActiveClassId) {
  console.log("\n=== Forced re-entry RPC (same class with active session) ===");
  console.log("forced class_id:", oldActiveClassId);

  const forced = await rpcCall(url, headers, {
    ...baseBody,
    p_forced_class_id: oldActiveClassId,
  });

  console.log("status:", forced.status);
  console.log(forced.text);

  if (forced.status === 200) {
    const status = sessionStatusFromResult(forced.json);
    console.log("Forced session_status:", status);
    console.log(
      "INFO: forced path may return active for existing members (expected)"
    );
  }
} else {
  console.log(
    "\nSkipped forced-path check (no active session in joined classes)"
  );
}

process.exit(exitCode);
