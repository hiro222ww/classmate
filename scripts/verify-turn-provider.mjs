#!/usr/bin/env node
/**
 * Static / env TURN provider checks (no credentials in output).
 *
 * Usage:
 *   node scripts/verify-turn-provider.mjs
 *   node scripts/verify-turn-provider.mjs --http --api-base http://localhost:3000
 */
import fs from "node:fs";
import { createReporter, loadEnvFile, resolveSupabaseConfig } from "./lib/prelaunch-test-utils.mjs";

function parseStaticTurnUrls(raw) {
  return String(raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveTurnProvider(env) {
  const raw = String(env.TURN_PROVIDER ?? "disabled")
    .trim()
    .toLowerCase();
  if (raw === "twilio" || raw === "static") return raw;
  return "disabled";
}

function buildStaticIceServers(env) {
  const urls = parseStaticTurnUrls(env.STATIC_TURN_URLS);
  const username = String(env.STATIC_TURN_USERNAME ?? "").trim();
  const credential = String(env.STATIC_TURN_CREDENTIAL ?? "").trim();
  const missing = [];
  if (urls.length === 0) missing.push("STATIC_TURN_URLS");
  if (!username) missing.push("STATIC_TURN_USERNAME");
  if (!credential) missing.push("STATIC_TURN_CREDENTIAL");
  if (missing.length > 0) {
    return { ok: false, error: "static_turn_env_missing", missing };
  }
  return {
    ok: true,
    iceServers: [{ urls, username, credential }],
  };
}

function redactIceServers(iceServers) {
  return iceServers.map((s) => ({
    urls: s.urls,
    username: s.username,
    credentialPresent: Boolean(s.credential),
  }));
}

function applyEnv(env) {
  for (const [k, v] of Object.entries(env)) {
    if (v != null && v !== "") process.env[k] = v;
  }
}

async function fetchVoiceSettingsTurnFallback(sb) {
  if (!sb.url || !sb.key) return null;
  const url = `${sb.url.replace(/\/$/, "")}/rest/v1/voice_settings?id=eq.global&select=turn_fallback_enabled`;
  const res = await fetch(url, {
    headers: {
      apikey: sb.key,
      Authorization: `Bearer ${sb.key}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.turn_fallback_enabled === true;
}

async function probeTurnApi(apiBase) {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/api/turn`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const argv = process.argv.slice(2);
const apiBase =
  argv.includes("--api-base")
    ? argv[argv.indexOf("--api-base") + 1]
    : process.env.API_BASE || "http://localhost:3000";
const httpProbe = argv.includes("--http");
const envFile = argv.includes("--env-file")
  ? argv[argv.indexOf("--env-file") + 1]
  : ".env.local";

const report = createReporter("turn-provider");
const fileEnv = loadEnvFile(envFile);

if (!fs.existsSync(envFile)) {
  report.fail("env file", `${envFile} not found`);
  process.exit(report.summary());
}

applyEnv(fileEnv);

const provider = resolveTurnProvider(process.env);
report.pass("TURN_PROVIDER resolved", `provider=${provider}`);

if (provider === "static") {
  const built = buildStaticIceServers(process.env);
  if (!built.ok) {
    report.fail("static iceServers build", built.error);
  } else {
    const server = built.iceServers[0];
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    report.pass("static urls array", `count=${urls.length} sample=${urls[0] ?? "-"}`);
    report.pass(
      "static username/credential present",
      `username=${server.username} credentialPresent=${Boolean(server.credential)}`
    );
    const redacted = redactIceServers(built.iceServers);
    report.pass("static response shape (redacted)", JSON.stringify(redacted, null, 2));
    if (JSON.stringify(redacted).includes(server.credential)) {
      report.fail("credential leak in redacted output", "unexpected");
    }
  }
} else {
  report.skip("static build", `provider=${provider}`);
}

const missingEnv = buildStaticIceServers({});
if (missingEnv.ok) {
  report.fail("empty env should fail", "expected static_turn_env_missing");
} else if (missingEnv.error === "static_turn_env_missing") {
  report.pass("empty env error", missingEnv.error);
} else {
  report.fail("empty env error", `got ${missingEnv.error}`);
}

const disabledProbe = resolveTurnProvider({ TURN_PROVIDER: "disabled" });
if (disabledProbe === "disabled") {
  report.pass("disabled provider", "TURN_PROVIDER=disabled");
} else {
  report.fail("disabled provider", `got ${disabledProbe}`);
}

const sb = resolveSupabaseConfig({ envFile });
const dbFallback = await fetchVoiceSettingsTurnFallback(sb);
if (dbFallback == null) {
  report.skip("DB turn_fallback_enabled", "Supabase unavailable");
} else {
  report.pass("DB turn_fallback_enabled", String(dbFallback));
}

if (httpProbe) {
  try {
    const { status, data } = await probeTurnApi(apiBase);
    const error = data?.error ?? null;
    const iceCount = Array.isArray(data?.iceServers)
      ? data.iceServers.length
      : Array.isArray(data?.ice_servers)
        ? data.ice_servers.length
        : 0;

    if (status === 403) {
      report.pass(
        "GET /api/turn blocked (expected when fallback off or provider disabled)",
        `status=403 error=${error}`
      );
    } else if (status === 200 && data?.provider === "static") {
      const urls = data?.iceServers?.[0]?.urls ?? data?.ice_servers?.[0]?.urls;
      const urlCount = Array.isArray(urls) ? urls.length : urls ? 1 : 0;
      report.pass(
        "GET /api/turn static",
        `provider=static iceServersCount=${iceCount} urlsCount=${urlCount} usernamePresent=${Boolean(data?.iceServers?.[0]?.username ?? data?.ice_servers?.[0]?.username)} credentialPresent=${Boolean(data?.iceServers?.[0]?.credential ?? data?.ice_servers?.[0]?.credential)}`
      );
      const body = JSON.stringify(data);
      if (fileEnv.STATIC_TURN_CREDENTIAL && body.includes(fileEnv.STATIC_TURN_CREDENTIAL)) {
        report.fail("HTTP response leaks credential", "credential found in JSON");
      } else {
        report.pass("HTTP response credential redaction check", "credential not echoed in test output path");
      }
    } else if (status === 200) {
      report.pass("GET /api/turn", `status=200 provider=${data?.provider ?? "?"} iceServersCount=${iceCount}`);
    } else if (status === 500 && error === "static_turn_env_missing") {
      report.pass("GET /api/turn static env missing", `status=500 error=${error}`);
    } else {
      report.fail("GET /api/turn", `status=${status} error=${error} provider=${data?.provider ?? "-"}`);
    }
  } catch (e) {
    report.fail("GET /api/turn", `${apiBase} — ${e?.message ?? e}\n(start npm run dev or omit --http)`);
  }
} else {
  report.skip("GET /api/turn", "pass --http to probe running server");
}

process.exit(report.summary());
