#!/usr/bin/env node
/**
 * Local Buffer connection probe (read-only).
 * Loads .env.local if present. Never prints the access token.
 * Does NOT create posts. Does NOT enable publish.
 *
 * Usage: node scripts/probe-buffer-connection.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env.local");
const MATCH = process.env.BUFFER_MATCH_HANDLE || "classmate0401";
const API = "https://api.buffer.com";

function loadEnvLocal() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out = {};
  const text = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function normalizeHandle(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

async function gql(token, query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (json?.errors?.length) {
    throw new Error(json.errors[0]?.message || "graphql_error");
  }
  return json?.data;
}

function main() {
  const fileEnv = loadEnvLocal();
  const token = (
    process.env.BUFFER_ACCESS_TOKEN ||
    process.env.BUFFER_API_KEY ||
    fileEnv.BUFFER_ACCESS_TOKEN ||
    fileEnv.BUFFER_API_KEY ||
    ""
  ).trim();
  const channelId = (
    process.env.BUFFER_CHANNEL_ID ||
    fileEnv.BUFFER_CHANNEL_ID ||
    ""
  ).trim();
  const publishEnabled =
    String(
      process.env.MARKETING_BUFFER_PUBLISH_ENABLED ||
        fileEnv.MARKETING_BUFFER_PUBLISH_ENABLED ||
        "0"
    ).trim() === "1";

  console.log("Buffer probe (read-only)");
  console.log("- .env.local:", fs.existsSync(ENV_PATH) ? "found" : "missing");
  console.log("- token present:", Boolean(token));
  console.log("- BUFFER_CHANNEL_ID set:", Boolean(channelId));
  console.log("- MARKETING_BUFFER_PUBLISH_ENABLED:", publishEnabled ? "1" : "0");

  if (!token) {
    console.log(
      "\nSet BUFFER_ACCESS_TOKEN in .env.local first (see docs/env.marketing.buffer.example)."
    );
    process.exit(2);
  }

  if (publishEnabled) {
    console.log(
      "\nWARNING: publish gate is ON. This script still will not post, but keep it 0 until ready."
    );
  }

  return (async () => {
    const orgData = await gql(
      token,
      `query { account { organizations { id name } } }`
    );
    const orgs = orgData?.account?.organizations || [];
    console.log("\nOrganizations:", orgs.length);
    for (const o of orgs) {
      console.log(`  - ${o.name} (${o.id})`);
    }

    const channels = [];
    for (const org of orgs) {
      const chData = await gql(
        token,
        `query($organizationId: OrganizationId!) {
          channels(input: { organizationId: $organizationId }) {
            id name service displayName externalLink isDisconnected isLocked
          }
        }`,
        { organizationId: org.id }
      );
      for (const ch of chData?.channels || []) {
        channels.push({ ...ch, organizationId: org.id });
      }
    }

    console.log("\nChannels:", channels.length);
    for (const ch of channels) {
      console.log(
        `  - [${ch.service}] ${ch.name} id=${ch.id}` +
          (ch.isDisconnected ? " DISCONNECTED" : "") +
          (ch.isLocked ? " LOCKED" : "")
      );
    }

    const needle = normalizeHandle(MATCH);
    const matched = channels.filter((ch) => {
      const hay = [ch.name, ch.displayName, ch.externalLink]
        .map(normalizeHandle)
        .join(" ");
      return hay.includes(needle);
    });
    const suggested =
      matched.find((c) => /twitter|x/i.test(String(c.service))) || matched[0];

    console.log(`\nMatch for @${needle}:`, matched.length);
    if (suggested) {
      console.log("Suggested BUFFER_CHANNEL_ID:", suggested.id);
      console.log(
        "Add to .env.local:\n  BUFFER_CHANNEL_ID=" + suggested.id + "\n  MARKETING_BUFFER_PUBLISH_ENABLED=0"
      );
    } else {
      console.log("No automatic match — pick the twitter/X channel id from the list.");
    }

    console.log(
      "\nPublish compatibility: existing adapter uses createPost customScheduled/addToQueue (no live post in this probe)."
    );
  })();
}

main().catch((err) => {
  console.error("Probe failed:", err?.message || String(err));
  process.exit(1);
});
