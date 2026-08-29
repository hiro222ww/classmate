#!/usr/bin/env node
/**
 * Apply one migration file to Supabase via postgres or management API.
 * Usage: node scripts/apply-single-migration.mjs supabase/migrations/20260827050000_session_age_match_declared_age.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-single-migration.mjs <migration.sql>");
  process.exit(2);
}

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
    return new URL(url).hostname.split(".")[0] || "";
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
  const full = path.join(root, file);
  const sql = fs.readFileSync(full, "utf8");
  const name = path.basename(full);

  console.log(`target=${projectRef || "unknown"}.supabase.co`);
  console.log(`file=${name} (${sql.length} bytes)`);
  console.log(`has_database_url=${Boolean(dbUrl)}`);
  console.log(`has_access_token=${Boolean(accessToken)}`);

  if (!dbUrl && !accessToken) {
    console.error("Missing DATABASE_URL and SUPABASE_ACCESS_TOKEN");
    process.exit(2);
  }

  if (dbUrl) await applyViaPostgres(dbUrl, sql, name);
  else await applyViaManagementApi(accessToken, projectRef, sql, name);
}

main().catch((err) => {
  console.error("FAILED:", err?.message || err);
  process.exit(1);
});
