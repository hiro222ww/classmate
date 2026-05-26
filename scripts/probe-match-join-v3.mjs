#!/usr/bin/env node
/**
 * Probe match_join_atomic_v3 on Supabase (PostgREST schema + direct RPC).
 * Usage: node scripts/probe-match-join-v3.mjs
 */
import fs from "node:fs";

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
};

console.log("Supabase URL:", url);

const specRes = await fetch(`${url}/rest/v1/`, { headers });
const spec = await specRes.json();
const v3 = spec.paths?.["/rpc/match_join_atomic_v3"]?.post?.parameters?.[0]?.schema;

console.log("\n=== PostgREST: match_join_atomic_v3 schema ===");
console.log(JSON.stringify(v3, null, 2));

const profileRes = await fetch(
  `${url}/rest/v1/user_profiles?select=device_id,display_name&limit=1`,
  { headers }
);
const profiles = await profileRes.json();
const profile = profiles?.[0];

if (!profile?.device_id) {
  console.error("\nNo user_profiles row found for RPC probe");
  process.exit(1);
}

console.log("\n=== Probe profile ===");
console.log(profile);

const rpcBody = {
  p_device_id: profile.device_id,
  p_display_name: profile.display_name || "Probe",
  p_forced_class_id: null,
  p_world_key: "default",
  p_topic_key: null,
  p_requested_capacity: 5,
  p_class_slots: 5,
  p_blocked_device_ids: [],
};

const rpcRes = await fetch(`${url}/rest/v1/rpc/match_join_atomic_v3`, {
  method: "POST",
  headers,
  body: JSON.stringify(rpcBody),
});

const rpcText = await rpcRes.text();
console.log("\n=== Direct RPC (topic/free path) ===");
console.log("status:", rpcRes.status);
console.log(rpcText);

if (rpcText.includes("42883") || rpcText.includes("text = uuid")) {
  console.log(
    "\nHint: apply supabase/migrations/20260526140000_match_join_atomic_v3_fix_session_class_id_cast.sql"
  );
}

if (rpcText.includes("42702") || rpcText.includes("ambiguous")) {
  console.log(
    "\nHint: apply supabase/migrations/20260526130000_match_join_atomic_v3_fix_ambiguous.sql"
  );
}
