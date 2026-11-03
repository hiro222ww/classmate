#!/usr/bin/env node
/**
 * My Class load timing helper (no auth secrets printed).
 *
 * Usage (Japan / authenticated device browser is preferred for real UX):
 *   1) Open classmate home with DevTools → Console
 *   2) Filter: home-perf
 *   3) Note:
 *      - [home-perf] firstPaint / joinedClasses
 *      - [home-perf] members ... membersFirstPaintMs=... statusPresenceMs=... totalMs=...
 *      - [home-perf] openClass ...
 *      - [api-session-status-perf] on the server (lite=1 fast=0 for home status)
 *      - [home-perf] path=mine_full sessionsMs / enrichMs
 *
 * Optional unauthenticated RTT probe against a deployment (inflated outside JP):
 *   node scripts/measure-myclass-load.mjs https://classmate-room.com
 */

const base = String(process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");

async function timed(path) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}${path}`, { cache: "no-store" });
    const ms = Date.now() - started;
    const text = await res.text();
    return { path, ms, status: res.status, bytes: text.length };
  } catch (error) {
    return {
      path,
      ms: Date.now() - started,
      status: "error",
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const fakeClass = "00000000-0000-4000-8000-000000000001";
const fakeSession = "00000000-0000-4000-8000-000000000002";
const fakeDevice = "00000000-0000-4000-8000-000000000003";

const paths = [
  `/api/class/mine?deviceId=${fakeDevice}&lite=1`,
  `/api/class/mine?deviceId=${fakeDevice}`,
  `/api/class/members?classId=${fakeClass}`,
  `/api/session/status?sessionId=${fakeSession}&classId=${fakeClass}`,
  `/api/session/status?sessionId=${fakeSession}&classId=${fakeClass}&lite=1`,
  `/api/session/status?sessionId=${fakeSession}&classId=${fakeClass}&lite=1&fast=1`,
  `/api/class/presence?classId=${fakeClass}`,
];

console.log(`[measure-myclass-load] base=${base}`);
console.log(
  "[measure-myclass-load] unauthenticated probe only — use browser home-perf logs for real user timings"
);

for (const path of paths) {
  const row = await timed(path);
  console.log(
    JSON.stringify({
      path: row.path.split("?")[0],
      ms: row.ms,
      status: row.status,
      bytes: row.bytes,
      error: row.error,
    })
  );
}
