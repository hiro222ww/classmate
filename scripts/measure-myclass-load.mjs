#!/usr/bin/env node
/**
 * My Class load timing helper (no auth secrets / PII printed).
 *
 * ## Real-device comparison (recommended, Asia/Tokyo)
 * 1. Open the preview/staging build (not production until approved).
 * 2. DevTools → Console filter: `classmate-perf` or `home-perf` or `room-perf`
 * 3. Hard-reload home while logged in.
 * 4. Copy `window.__classmatePerf` from the Console after members + call badges appear.
 * 5. Open a class from My Class; confirm `roomFirstMembersPaintMs` / path=home_snapshot.
 * 6. Network tab: count `/api/class/members`, `/api/session/status`, `/api/class/presence`
 *    for the first members wave (after enrich). Expected ≈
 *    classes + classes_with_session + classes (members + status + presence).
 * 7. Server logs (Vercel): `[home-perf] path=mine_*`, `[api-session-status-perf] lite=1 fast=0`
 *
 * Fields in window.__classmatePerf:
 * - homeFirstPaintMs          home class list first paint
 * - membersFirstPaintMs       roster names/avatars first paint (wave-relative)
 * - callStateReadyMs          call/presence overlay ready (wave-relative)
 * - membersRequestCount       planned client requests for that wave
 * - openClassTotalMs          home → room navigation path time
 * - roomFirstMembersPaintMs   room roster from snapshot
 * - roomSnapshotAgeMs         age of seeded snapshot
 *
 * ## Functional checklist
 * [ ] Member names + photos on home
 * [ ] In-call vs not-in-call badges accurate after callStateReady
 * [ ] Room shows home-seeded members immediately, then refreshes
 * [ ] Leave/delete clears that class; no stale snapshot reuse
 * [ ] Photo change eventually refreshes (poll / re-entry)
 * [ ] Two classes: members keyed separately (no cross mix)
 * [ ] Throttle Network / fail status: home still shows members
 * [ ] /api/class/mine still requires device actor auth
 *
 * Optional unauthenticated RTT probe:
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
  "[measure-myclass-load] unauthenticated probe only — use window.__classmatePerf on a JP logged-in device for UX timings"
);

for (const path of paths) {
  const row = await timed(path);
  console.log(
    JSON.stringify({
      path: row.path.split("?")[0],
      query: row.path.includes("lite")
        ? row.path.includes("fast")
          ? "lite+fast"
          : "lite"
        : row.path.includes("deviceId") && !row.path.includes("lite")
          ? "full"
          : "default",
      ms: row.ms,
      status: row.status,
      bytes: row.bytes,
      error: row.error,
    })
  );
}

console.log(
  JSON.stringify({
    compareHints: {
      homeFirstPaint: "home-perf firstPaint / __classmatePerf.homeFirstPaintMs",
      membersFirstPaint:
        "home-perf membersFirstPaintMs / __classmatePerf.membersFirstPaintMs",
      callStateReady:
        "home-perf callStateReadyMs / __classmatePerf.callStateReadyMs",
      roomFirstPaint:
        "room-perf firstMembersPaint / __classmatePerf.roomFirstMembersPaintMs",
      apiRequestCount:
        "Network filter api/class/members|session/status|class/presence OR __classmatePerf.membersRequestCount",
      serverMs:
        "[home-perf] mine_* totalMs/sessionsMs/enrichMs and [api-session-status-perf] totalMs lite=1",
    },
  })
);
