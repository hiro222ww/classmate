#!/usr/bin/env node
/**
 * Verify match_join_atomic_v3 accepts p_requested_min_age / p_requested_max_age (230000 migration).
 * Exit 0 = migration applied; exit 1 = still on 8-arg RPC (do NOT deploy TS yet).
 */
import fs from "node:fs";

function loadEnv() {
  const path = ".env.local";
  if (!fs.existsSync(path)) throw new Error(".env.local not found");
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

const res = await fetch(`${url}/rest/v1/rpc/match_join_atomic_v3`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    p_device_id: `verify-lock-${Date.now()}`,
    p_display_name: "verify",
    p_world_key: "default",
    p_topic_key: null,
    p_requested_capacity: 5,
    p_class_slots: 10,
    p_blocked_device_ids: [],
    p_requested_min_age: 0,
    p_requested_max_age: 120,
  }),
});

const text = await res.text();
let json = null;
try {
  json = text ? JSON.parse(text) : null;
} catch {
  json = text;
}

if (json?.code === "PGRST202") {
  console.error("FAIL: 10-arg match_join_atomic_v3 not found (230000 migration not applied)");
  console.error(json.details ?? text);
  process.exit(1);
}

if (json?.code === "23503" || json?.code === "P0001" || Array.isArray(json)) {
  console.log("PASS: 10-arg RPC signature is available (PostgREST accepts age params)");
  process.exit(0);
}

console.log("Response:", text.slice(0, 500));
console.log("PASS: 10-arg RPC appears available (non-PGRST202 response)");
process.exit(0);
