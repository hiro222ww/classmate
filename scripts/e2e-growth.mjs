#!/usr/bin/env node
/**
 * Session/class growth & reuse probes.
 */
import {
  apiMatchJoin,
  createReporter,
  devDeviceId,
  ensureDevDevices,
  parseArgs,
  resolveSupabaseConfig,
  sbFetch,
  SYSTEM_CLASS_NAME_PATTERN,
} from "./lib/prelaunch-test-utils.mjs";

const opts = parseArgs();
const sb = resolveSupabaseConfig(opts);
const report = createReporter("growth");
const deviceId = devDeviceId("3");

if (!sb.url || !sb.key) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

await ensureDevDevices(sb, sb, ["3"], 10);

report.info("\n=== [1] forming session growth in last hour ===");
const formingRes = await sbFetch(
  sb.url,
  sb.key,
  `/rest/v1/sessions?select=id,status,created_at&status=in.(forming,waiting)&created_at=gt.${encodeURIComponent(
    new Date(Date.now() - 60 * 60 * 1000).toISOString()
  )}`
);
const forming = Array.isArray(formingRes.json) ? formingRes.json : [];
report.info(`forming/waiting last 1h: ${forming.length}`);
if (forming.length > 500) {
  report.fail("forming session count unusually high", { count: forming.length });
} else {
  report.pass("forming session count within sanity bound");
}

report.info("\n=== [2] orphan classes (no session_members, recent) ===");
const recentClasses = await sbFetch(
  sb.url,
  sb.key,
  `/rest/v1/classes?select=id,name,created_at&created_at=gt.${encodeURIComponent(
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  )}&order=created_at.desc&limit=50`
);
const classes = Array.isArray(recentClasses.json) ? recentClasses.json : [];
let orphanCount = 0;
for (const c of classes.slice(0, 20)) {
  const members = await sbFetch(
    sb.url,
    sb.key,
    `/rest/v1/session_members?select=device_id&session_id=in.(select id from sessions where class_id=eq.${encodeURIComponent(c.id)})`
  );
  // fallback simpler: sessions for class
  const sessions = await sbFetch(
    sb.url,
    sb.key,
    `/rest/v1/sessions?select=id&class_id=eq.${encodeURIComponent(c.id)}&limit=5`
  );
  const sessionIds = (sessions.json ?? []).map((s) => s.id);
  if (sessionIds.length === 0) {
    orphanCount += 1;
    continue;
  }
  let hasMember = false;
  for (const sid of sessionIds) {
    const sm = await sbFetch(
      sb.url,
      sb.key,
      `/rest/v1/session_members?select=device_id&session_id=eq.${encodeURIComponent(sid)}&limit=1`
    );
    if ((sm.json ?? []).length > 0) {
      hasMember = true;
      break;
    }
  }
  if (!hasMember) orphanCount += 1;
}
report.info(`recent classes without members (sampled): ${orphanCount}/20`);
if (orphanCount > 15) {
  report.fail("too many orphan recent classes", { orphanCount });
} else {
  report.pass("orphan class ratio acceptable in sample");
}

report.info("\n=== [3] normal match naming + no joined-class reuse ===");
const mineRes = await fetch(
  `${opts.apiBase}/api/class/mine?deviceId=${encodeURIComponent(deviceId)}`,
  { cache: "no-store" }
);
const mine = await mineRes.json().catch(() => ({}));
const joined = new Set(
  (mine?.classes ?? []).map((c) => String(c.id ?? c.class_id ?? ""))
);

const join = await apiMatchJoin(opts.apiBase, {
  deviceId,
  worldKey: "default",
  topicKey: null,
  capacity: 5,
});

if (join.status === 200 && join.json?.ok) {
  if (joined.has(String(join.json.classId ?? ""))) {
    report.fail("normal match reused joined class", join.json.classId);
  } else {
    report.pass("normal match did not reuse joined class");
  }
  if (join.json.createdNewClass && !SYSTEM_CLASS_NAME_PATTERN.test(String(join.json.className ?? ""))) {
    report.fail("new class name not クラスNNNNX", join.json.className);
  } else {
    report.pass("new class naming ok or reused existing");
  }
} else if (join.json?.error === "class_slots_limit") {
  report.skip("normal match growth", "class_slots_limit");
} else {
  report.fail("normal match failed", JSON.stringify(join.json));
}

report.info("\n=== [4] expired sessions exist (cleanup working) ===");
const expired = await sbFetch(
  sb.url,
  sb.key,
  `/rest/v1/sessions?select=id&status=eq.expired&limit=1`
);
if ((expired.json ?? []).length > 0) {
  report.pass("expired status in use");
} else {
  report.skip("expired status", "no expired rows yet");
}

process.exit(report.summary());
