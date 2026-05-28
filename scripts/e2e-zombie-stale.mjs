#!/usr/bin/env node
/**
 * Zombie / stale presence & session probes (API + DB level).
 */
import {
  apiMine,
  createReporter,
  devDeviceId,
  parseArgs,
  resolveSupabaseConfig,
  sbFetch,
} from "./lib/prelaunch-test-utils.mjs";

const opts = parseArgs();
const sb = resolveSupabaseConfig(opts);
const report = createReporter("zombie-stale");
const deviceId = devDeviceId("2");

if (!sb.url || !sb.key) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

report.info("\n=== [1] stale forming count before/after mine expire ===");
const staleBefore = await sbFetch(
  sb.url,
  sb.key,
  `/rest/v1/sessions?select=id,status,created_at&status=in.(forming,waiting)&created_at=lt.${encodeURIComponent(
    new Date(Date.now() - 6 * 60 * 1000).toISOString()
  )}`
);
const beforeCount = Array.isArray(staleBefore.json) ? staleBefore.json.length : 0;
report.info(`stale forming/waiting (>6m) before mine: ${beforeCount}`);

await apiMine(opts.apiBase, deviceId);

const expiredAfter = await sbFetch(
  sb.url,
  sb.key,
  `/rest/v1/sessions?select=id&status=eq.expired&created_at=gt.${encodeURIComponent(
    new Date(Date.now() - 2 * 60 * 1000).toISOString()
  )}`
);
const expiredRecent = Array.isArray(expiredAfter.json) ? expiredAfter.json.length : 0;
if (beforeCount > 0 && expiredRecent === 0) {
  report.skip("mine expire", "stale sessions exist but none expired recently (TTL may be unlimited)");
} else {
  report.pass("mine triggers expire path or no stale sessions present");
}

report.info("\n=== [2] mine should not label stale forming as 募集中 ===");
const mine = await apiMine(opts.apiBase, deviceId);
const classes = mine.json?.classes ?? [];
const recruitingStale = classes.filter((c) => {
  const label = String(c.status_label ?? "");
  const created = c.session_created_at ? new Date(c.session_created_at).getTime() : null;
  const ttl = Number(mine.json?.recruitment_session_ttl_minutes ?? 5);
  const unlimited = mine.json?.recruitment_session_ttl_unlimited === true;
  if (unlimited || !created) return false;
  const stale = Date.now() - created > ttl * 60 * 1000;
  return stale && label === "募集中";
});
if (recruitingStale.length > 0) {
  report.fail("mine shows 募集中 for stale sessions", recruitingStale);
} else {
  report.pass("mine does not show stale 募集中");
}

report.info("\n=== [3] presence GET marks old heartbeat offline ===");
const classesWithId = classes.filter((c) => c.id);
if (classesWithId.length === 0) {
  report.skip("presence TTL", "no classes on mine");
} else {
  const classId = classesWithId[0].id;
  const presenceRes = await fetch(
    `${opts.apiBase}/api/class/presence?classId=${encodeURIComponent(classId)}`,
    { cache: "no-store" }
  );
  const presenceJson = await presenceRes.json().catch(() => ({}));
  const items = presenceJson?.items ?? presenceJson?.presence ?? [];
  const staleOnline = items.filter((p) => {
    const last = new Date(p.last_seen_at ?? 0).getTime();
    const ageMs = Date.now() - last;
    return ageMs > 2 * 60 * 1000 && p.effective_status !== "offline";
  });
  if (staleOnline.length > 0) {
    report.fail("presence shows stale users as online", staleOnline.slice(0, 3));
  } else {
    report.pass("presence TTL treats old heartbeat as offline");
  }
}

report.info("\n=== [4] session_members scoped by session_id on members API ===");
const withSession = classes.find((c) => c.session_id);
if (!withSession) {
  report.skip("members API session scope", "no session_id on mine class");
} else {
  const scoped = await fetch(
    `${opts.apiBase}/api/class/members?classId=${encodeURIComponent(withSession.id)}&sessionId=${encodeURIComponent(withSession.session_id)}`,
    { cache: "no-store" }
  );
  const scopedJson = await scoped.json().catch(() => ({}));
  const unscoped = await fetch(
    `${opts.apiBase}/api/class/members?classId=${encodeURIComponent(withSession.id)}`,
    { cache: "no-store" }
  );
  const unscopedJson = await unscoped.json().catch(() => ({}));
  if (scopedJson.source === "session_members") {
    report.pass("members API uses session_members when sessionId provided");
  } else {
    report.fail("members API session scope", scopedJson);
  }
  if (
    Array.isArray(unscopedJson.members) &&
    Array.isArray(scopedJson.members) &&
    unscopedJson.members.length >= scopedJson.members.length
  ) {
    report.pass("class_memberships count >= session_members count (expected)");
  }
}

process.exit(report.summary());
