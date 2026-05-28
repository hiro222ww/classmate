#!/usr/bin/env node
/**
 * Concurrent normal join load test (dev test-device-1..N).
 *
 * Usage:
 *   node scripts/e2e-concurrent-join.mjs
 *   node scripts/e2e-concurrent-join.mjs --api-base https://your-app.vercel.app --concurrency 30
 */
import {
  apiMatchJoin,
  apiSessionJoin,
  apiMine,
  BLOCKED_STATUSES,
  countSessionMembers,
  createReporter,
  devDeviceId,
  ensureDevDevices,
  fetchSessionRow,
  fetchTopics,
  logJoinResult,
  makeRunId,
  parseArgs,
  resolveSupabaseConfig,
  sbFetch,
} from "./lib/prelaunch-test-utils.mjs";

const opts = parseArgs();
const sb = resolveSupabaseConfig(opts);
const report = createReporter("concurrent-join");
const runId = makeRunId();

if (!sb.url || !sb.key) {
  console.error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const devKeys = Array.from({ length: opts.concurrency }, (_, i) => String(i + 1));
const scenarios = [
  { name: "free", worldKey: "default", topicKey: null },
];

const topics = await fetchTopics(sb, sb);
const openTopic = topics.find((t) => !String(t.gender_restriction ?? "").trim()) ?? topics[0];
if (openTopic?.topic_key) {
  scenarios.push({
    name: `topic:${openTopic.topic_key}`,
    worldKey: "default",
    topicKey: openTopic.topic_key,
  });
}

report.info(`\n=== concurrent join runId=${runId} api=${opts.apiBase} n=${devKeys.length} ===`);

await ensureDevDevices(sb, sb, devKeys, 10);

for (const scenario of scenarios) {
  report.info(`\n--- scenario: ${scenario.name} ---`);

  const wave = devKeys.map(async (devKey) => {
    const deviceId = devDeviceId(devKey);
    let mineBefore = { json: {} };
    try {
      mineBefore = await apiMine(opts.apiBase, deviceId);
    } catch (e) {
      console.warn("[concurrent] mineBefore failed", deviceId, e?.message);
    }
    const res = await apiMatchJoin(opts.apiBase, {
      deviceId,
      worldKey: scenario.worldKey,
      topicKey: scenario.topicKey,
      capacity: 5,
    });
    logJoinResult(`match:${scenario.name}`, deviceId, res);

    let sessionJoin = null;
    if (res.status === 200 && res.json?.ok && res.json?.sessionId) {
      sessionJoin = await apiSessionJoin(opts.apiBase, {
        deviceId,
        sessionId: res.json.sessionId,
        classId: res.json.classId,
        displayName: `E2E-${devKey}`,
      });
      logJoinResult(`session:${scenario.name}`, deviceId, sessionJoin);
    }

    return {
      devKey,
      deviceId,
      mineBefore,
      match: res,
      sessionJoin,
    };
  });

  const results = await Promise.all(wave);
  const okRows = results.filter((r) => r.match.status === 200 && r.match.json?.ok);
  const slotLimited = results.filter((r) => r.match.json?.error === "class_slots_limit");
  const blocked = results.filter((r) =>
    BLOCKED_STATUSES.has(String(r.match.json?.sessionStatus ?? "").toLowerCase())
  );

  report.info(`ok=${okRows.length} slotLimited=${slotLimited.length} blockedStatus=${blocked.length}`);

  if (slotLimited.length > 0) {
    const sample = slotLimited[0];
    report.skip(
      `${scenario.name}: class_slots_limit for ${slotLimited.length} devices`,
      JSON.stringify({
        deviceId: sample.deviceId,
        currentCount: sample.match.json?.currentCount,
        billableMembershipCount: sample.match.json?.billableMembershipCount,
        legacyMembershipCount: sample.match.json?.legacyMembershipCount,
        classSlots: sample.match.json?.classSlots,
        mineBefore: sample.mineBefore?.json?.debug,
      })
    );
  }

  if (blocked.length > 0) {
    report.fail(
      `${scenario.name}: normal match returned blocked session status`,
      blocked.map((r) => ({
        deviceId: r.deviceId,
        sessionStatus: r.match.json?.sessionStatus,
        sessionId: r.match.json?.sessionId,
      }))
    );
  }

  const sessionMap = new Map();
  for (const row of okRows) {
    const sessionId = String(row.match.json?.sessionId ?? "").trim();
    if (!sessionId) continue;
    const list = sessionMap.get(sessionId) ?? [];
    list.push(row);
    sessionMap.set(sessionId, list);
  }

  for (const [sessionId, rows] of sessionMap.entries()) {
    const dbCount = await countSessionMembers(sb, sb, sessionId);
    const sessionRow = await fetchSessionRow(sb, sb, sessionId);
    const capacity = Number(sessionRow?.capacity ?? 5);
    const uniqueDevices = new Set(rows.map((r) => r.deviceId));

    report.info(
      `session ${sessionId} status=${sessionRow?.status} members=${dbCount}/${capacity} waveDevices=${uniqueDevices.size}`
    );

    if (dbCount > capacity) {
      report.fail(`${scenario.name}: capacity exceeded`, { sessionId, dbCount, capacity });
    } else {
      report.pass(`${scenario.name}: session ${sessionId.slice(0, 8)} within capacity`);
    }

    if (BLOCKED_STATUSES.has(String(sessionRow?.status ?? "").toLowerCase())) {
      report.fail(`${scenario.name}: joined blocked session`, sessionRow);
    }
  }

  const classIds = new Set(
    okRows.map((r) => String(r.match.json?.classId ?? "").trim()).filter(Boolean)
  );
  const createdNewClass = okRows.filter((r) => r.match.json?.createdNewClass === true).length;
  const capacity = 5;
  const expectedSessions = Math.ceil(okRows.length / capacity);
  const maxSessions = expectedSessions + 1;
  report.info(
    `${scenario.name}: uniqueClasses=${classIds.size} createdNewClass=${createdNewClass} uniqueSessions=${sessionMap.size} expected~${expectedSessions} max=${maxSessions}`
  );

  if (sessionMap.size > maxSessions) {
    report.fail(
      `${scenario.name}: excessive session split (n=${okRows.length} capacity=${capacity} got ${sessionMap.size} sessions, max ${maxSessions})`,
      {
        uniqueSessions: sessionMap.size,
        uniqueClasses: classIds.size,
        createdNewClass,
        okCount: okRows.length,
        expectedSessions,
        maxSessions,
      }
    );
  } else {
    report.pass(
      `${scenario.name}: session count within bounds (${sessionMap.size}/${maxSessions})`
    );
  }

  if (createdNewClass > maxSessions) {
    report.fail(
      `${scenario.name}: excessive new class creation (max ${maxSessions}, got ${createdNewClass})`,
      { createdNewClass, okCount: okRows.length, uniqueSessions: sessionMap.size }
    );
  } else {
    report.pass(`${scenario.name}: new class creation within expected bounds`);
  }

  const duplicateDeviceInWave = results
    .filter((r) => r.match.json?.ok)
    .map((r) => r.deviceId);
  if (duplicateDeviceInWave.length !== new Set(duplicateDeviceInWave).size) {
    report.fail(`${scenario.name}: duplicate device entries in wave`);
  } else {
    report.pass(`${scenario.name}: one result per device`);
  }
}

process.exit(report.summary());
