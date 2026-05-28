#!/usr/bin/env node
/**
 * Recovery / reload / openJoinedClass vs normal match probes.
 */
import {
  apiMatchJoin,
  apiMine,
  BLOCKED_STATUSES,
  createReporter,
  devDeviceId,
  ensureDevDevices,
  parseArgs,
  resolveSupabaseConfig,
} from "./lib/prelaunch-test-utils.mjs";

const opts = parseArgs();
const sb = resolveSupabaseConfig(opts);
const report = createReporter("recovery");
const deviceId = devDeviceId("1");

if (!sb.url || !sb.key) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

await ensureDevDevices(sb, sb, ["1"], 10);

report.info("\n=== [1] normal match should not return joined class ===");
const mine1 = await apiMine(opts.apiBase, deviceId);
const joinedIds = new Set(
  (mine1.json?.classes ?? []).map((c) => String(c.id ?? c.class_id ?? ""))
);

const normal = await apiMatchJoin(opts.apiBase, {
  deviceId,
  worldKey: "default",
  topicKey: null,
  capacity: 5,
});

if (normal.status === 200 && normal.json?.ok) {
  const classId = String(normal.json.classId ?? "");
  if (joinedIds.has(classId)) {
    report.fail("normal match reused already-joined class", classId);
  } else {
    report.pass("normal match avoided already-joined class");
  }
  if (BLOCKED_STATUSES.has(String(normal.json.sessionStatus ?? "").toLowerCase())) {
    report.fail("normal match returned blocked session status", normal.json.sessionStatus);
  } else {
    report.pass("normal match session status is recruiting");
  }
} else if (normal.json?.error === "class_slots_limit") {
  report.skip("normal match", "class_slots_limit — check billable memberships");
} else {
  report.fail("normal match failed", JSON.stringify(normal.json));
}

report.info("\n=== [2] openJoinedClass re-entry ===");
const mine2 = await apiMine(opts.apiBase, deviceId);
const visible = mine2.json?.classes ?? [];
if (visible.length === 0) {
  report.skip("openJoinedClass", "no visible classes on mine");
} else {
  const target = visible[0];
  const forced = await apiMatchJoin(opts.apiBase, {
    deviceId,
    worldKey: target.world_key ?? "default",
    topicKey: target.topic_key ?? null,
    capacity: 5,
    openJoinedClass: true,
    classId: target.id ?? target.class_id,
  });

  if (forced.status === 200 && forced.json?.ok) {
    if (String(forced.json.classId) === String(target.id ?? target.class_id)) {
      report.pass("openJoinedClass keeps requested class_id");
    } else {
      report.fail("openJoinedClass changed class_id", forced.json);
    }
    if (forced.json.error === "class_slots_limit") {
      report.fail("openJoinedClass blocked by class_slots_limit");
    } else {
      report.pass("openJoinedClass not blocked by slots");
    }
  } else {
    report.fail("openJoinedClass failed", JSON.stringify(forced.json));
  }
}

report.info("\n=== [3] second normal match should create/use fresh session, not stale active ===");
const normal2 = await apiMatchJoin(opts.apiBase, {
  deviceId,
  worldKey: "default",
  topicKey: null,
  capacity: 5,
});

if (normal2.status === 200 && normal2.json?.ok) {
  if (BLOCKED_STATUSES.has(String(normal2.json.sessionStatus ?? "").toLowerCase())) {
    report.fail("second normal match returned stale/blocked session", normal2.json);
  } else {
    report.pass("second normal match returned recruiting session");
  }
} else if (normal2.json?.error === "class_slots_limit") {
  report.skip("second normal match", "class_slots_limit");
} else if (normal2.json?.error === "recruitment_closed") {
  report.pass("second normal match blocked stale recruitment (expected guard)");
} else {
  report.fail("second normal match unexpected", JSON.stringify(normal2.json));
}

process.exit(report.summary());
