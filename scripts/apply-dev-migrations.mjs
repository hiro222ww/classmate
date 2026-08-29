#!/usr/bin/env node
/**
 * Apply Phase 1–3 SQL migrations to the development Supabase project
 * referenced by .env.local. Does not print secrets.
 *
 * Prefers DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL when present.
 * Falls back to Supabase Management API if SUPABASE_ACCESS_TOKEN is set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const MIGRATIONS = [
  "20260827010000_min_profile_and_provisional_class.sql",
  "20260827020000_match_join_provisional_slots_and_lock.sql",
  "20260827030000_session_class_votes_and_promote.sql",
  "20260827040000_product_funnel_events.sql",
  "20260827050000_session_age_match_declared_age.sql",
  "20260827060000_match_join_exclude_locked_candidates.sql",
];

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const onlyFiles = onlyArg
  ? onlyArg
      .slice("--only=".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

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

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || "";
  } catch {
    return "";
  }
}

async function applyViaPostgres(connectionString, sql, name) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`OK postgres: ${name}`);
  } finally {
    await client.end();
  }
}

async function applyViaManagementApi(accessToken, projectRef, sql, name) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`management_api ${res.status}: ${text.slice(0, 400)}`);
  }
  console.log(`OK management-api: ${name}`);
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const projectRef = projectRefFromUrl(supabaseUrl);
  const dbUrl =
    env.DATABASE_URL ||
    env.SUPABASE_DB_URL ||
    env.POSTGRES_URL ||
    env.DIRECT_URL ||
    "";
  const accessToken =
    env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN || "";

  console.log(`target_host=${projectRef || "(unknown)"}.supabase.co`);
  console.log(`has_database_url=${Boolean(dbUrl)}`);
  console.log(`has_access_token=${Boolean(accessToken)}`);

  if (!dbUrl && !accessToken) {
    console.error(
      "Missing DATABASE_URL (or SUPABASE_DB_URL) and SUPABASE_ACCESS_TOKEN.\n" +
        "Add a development DB connection string to .env.local, or set SUPABASE_ACCESS_TOKEN,\n" +
        "then re-run: node scripts/apply-dev-migrations.mjs"
    );
    process.exit(2);
  }

  for (const file of MIGRATIONS) {
    if (onlyFiles && !onlyFiles.some((part) => file.includes(part))) {
      console.log(`Skip ${file} (--only)`);
      continue;
    }
    const full = path.join(root, "supabase/migrations", file);
    const sql = fs.readFileSync(full, "utf8");
    console.log(`Applying ${file} (${sql.length} bytes)...`);
    if (dbUrl) {
      await applyViaPostgres(dbUrl, sql, file);
    } else {
      await applyViaManagementApi(accessToken, projectRef, sql, file);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("FAILED:", err?.message || err);
  process.exit(1);
});
