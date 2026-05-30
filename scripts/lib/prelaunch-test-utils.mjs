import fs from "node:fs";
import { randomUUID } from "node:crypto";

export const BLOCKED_STATUSES = new Set(["active", "closed", "expired"]);
export const SYSTEM_CLASS_NAME_PATTERN = /^クラス\d{4}[A-Z]$/;

export function parseArgs(argv = process.argv.slice(2)) {
  const get = (flag, fallback = null) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : fallback;
  };

  return {
    apiBase: get("--api-base", process.env.API_BASE || "http://localhost:3000"),
    supabaseUrl:
      get("--supabase-url", process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
    serviceKey: get("--service-key", process.env.SUPABASE_SERVICE_ROLE_KEY),
    envFile: get("--env-file", ".env.local"),
    concurrency: Number(get("--concurrency", "30")),
    dryRun: argv.includes("--dry-run"),
  };
}

export function loadEnvFile(path = ".env.local") {
  if (!fs.existsSync(path)) return {};
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

export function resolveSupabaseConfig(opts) {
  const env = loadEnvFile(opts.envFile);
  const url =
    opts.supabaseUrl ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    "";
  const key = opts.serviceKey || env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, key };
}

export function createReporter(title) {
  let exitCode = 0;
  const results = [];

  return {
    pass(label, detail) {
      console.log(`PASS: ${label}`);
      if (detail) console.log(detail);
      results.push({ ok: true, label, detail });
    },
    fail(label, detail) {
      console.error(`FAIL: ${label}`);
      if (detail) console.error(detail);
      exitCode = 1;
      results.push({ ok: false, label, detail });
    },
    skip(label, detail) {
      console.log(`SKIP: ${label}`);
      if (detail) console.log(detail);
      results.push({ ok: null, label, detail });
    },
    info(label, detail) {
      console.log(`${label}`);
      if (detail) console.log(detail);
    },
    summary() {
      const passed = results.filter((r) => r.ok === true).length;
      const failed = results.filter((r) => r.ok === false).length;
      const skipped = results.filter((r) => r.ok === null).length;
      console.log(`\n=== ${title} summary ===`);
      console.log(`passed=${passed} failed=${failed} skipped=${skipped}`);
      return exitCode;
    },
    get exitCode() {
      return exitCode;
    },
  };
}

export function sbHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export async function sbFetch(url, key, path, init = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...sbHeaders(key),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json, ok: res.ok };
}

export function devDeviceId(devKey) {
  return `test-device-${devKey}`;
}

/** WebRTC E2E 専用 — test-device-* とは別 namespace */
export const WEBRTC_E2E_DEVICE_PREFIX = "webrtc-test-device-";

export function webrtcTestDeviceId(devKey) {
  return `${WEBRTC_E2E_DEVICE_PREFIX}${String(devKey ?? "").trim()}`;
}

export function webrtcDevParam(devKey) {
  return `webrtc${String(devKey ?? "").trim()}`;
}

export function isWebrtcE2eDeviceId(deviceId) {
  return /^webrtc-test-device-\d+$/.test(String(deviceId ?? "").trim());
}

/**
 * webrtc-test-device-* の presence / session_members / class_memberships のみ削除。
 * user_profiles / user_entitlements / test-device-* は触らない。
 */
export async function cleanupWebrtcE2eDeviceState(sb, { url, key }, devKeys) {
  const tables = ["class_presence", "session_members", "class_memberships"];

  for (const devKey of devKeys) {
    const deviceId = webrtcTestDeviceId(devKey);
    if (!isWebrtcE2eDeviceId(deviceId)) {
      throw new Error(`refusing cleanup for deviceId=${deviceId}`);
    }

    for (const table of tables) {
      const res = await sbFetch(
        url,
        key,
        `/rest/v1/${table}?device_id=eq.${encodeURIComponent(deviceId)}`,
        {
          method: "DELETE",
          headers: { Prefer: "return=minimal" },
        }
      );
      if (!res.ok && res.status !== 404) {
        console.warn(`[webrtc-e2e-cleanup] ${table} ${deviceId} status=${res.status}`);
      }
    }
  }
}

export async function ensureDevDevices(
  sb,
  { url, key },
  devKeys,
  classSlots = 5,
  { deviceIdFn = devDeviceId, displayNamePrefix = "E2E" } = {}
) {
  for (const devKey of devKeys) {
    const deviceId = deviceIdFn(devKey);
    await sbFetch(url, key, "/rest/v1/user_profiles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        device_id: deviceId,
        display_name: `${displayNamePrefix}-${devKey}`,
        gender: Number(devKey) % 2 === 0 ? "female" : "male",
        birth_date: "2000-01-01",
      }),
    });
    await sbFetch(url, key, "/rest/v1/user_entitlements", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        device_id: deviceId,
        plan: "slots_5",
        class_slots: classSlots,
        topic_plan: 0,
        can_create_classes: true,
        theme_pass: false,
        updated_at: new Date().toISOString(),
      }),
    });
  }
}

export async function apiMatchJoin(apiBase, body) {
  const res = await fetch(`${apiBase}/api/class/match-join-v2`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export async function apiSessionJoin(apiBase, body) {
  const res = await fetch(`${apiBase}/api/session/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export async function apiMine(apiBase, deviceId) {
  const res = await fetch(
    `${apiBase}/api/class/mine?deviceId=${encodeURIComponent(deviceId)}`,
    { cache: "no-store" }
  );
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export async function apiEntitlements(apiBase, deviceId) {
  const res = await fetch(`${apiBase}/api/user/entitlements`, {
    headers: { "x-device-id": deviceId },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export function logJoinResult(prefix, deviceId, res) {
  const j = res.json ?? {};
  console.log(
    JSON.stringify({
      tag: prefix,
      deviceId,
      status: res.status,
      ok: j.ok,
      error: j.error ?? null,
      class_id: j.classId ?? null,
      session_id: j.sessionId ?? null,
      session_status: j.sessionStatus ?? null,
      reused: j.reused ?? null,
      created_new_class: j.createdNewClass ?? null,
      created_new_session: j.createdNewSession ?? null,
      current_count: j.currentCount ?? j.billableMembershipCount ?? null,
      class_slots: j.classSlots ?? null,
    })
  );
}

export function makeRunId() {
  return randomUUID().slice(0, 8);
}

export async function fetchTopics(sb, { url, key }) {
  const res = await sbFetch(
    url,
    key,
    "/rest/v1/topics?select=topic_key,title,gender_restriction&is_archived=eq.false&order=topic_key.asc"
  );
  return Array.isArray(res.json) ? res.json : [];
}

export async function countSessionMembers(sb, { url, key }, sessionId) {
  const res = await sbFetch(
    url,
    key,
    `/rest/v1/session_members?select=device_id&session_id=eq.${encodeURIComponent(sessionId)}`
  );
  const rows = Array.isArray(res.json) ? res.json : [];
  return new Set(rows.map((r) => String(r.device_id ?? "").trim()).filter(Boolean)).size;
}

export async function fetchSessionRow(sb, { url, key }, sessionId) {
  const res = await sbFetch(
    url,
    key,
    `/rest/v1/sessions?select=id,class_id,status,capacity,created_at&id=eq.${encodeURIComponent(sessionId)}`
  );
  return Array.isArray(res.json) ? res.json[0] ?? null : null;
}
