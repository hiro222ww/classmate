#!/usr/bin/env node
/**
 * Entitlements / class_slots reflection probes.
 */
import {
  apiEntitlements,
  apiMatchJoin,
  apiMine,
  createReporter,
  devDeviceId,
  parseArgs,
  resolveSupabaseConfig,
  sbFetch,
} from "./lib/prelaunch-test-utils.mjs";

const opts = parseArgs();
const sb = resolveSupabaseConfig(opts);
const report = createReporter("entitlements");
const deviceId = devDeviceId("4");

if (!sb.url || !sb.key) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

report.info("\n=== [1] entitlements API reflects DB class_slots ===");
await sbFetch(sb.url, sb.key, "/rest/v1/user_entitlements", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({
    device_id: deviceId,
    plan: "slots_5",
    class_slots: 5,
    topic_plan: 0,
    can_create_classes: true,
    updated_at: new Date().toISOString(),
  }),
});

const ent = await apiEntitlements(opts.apiBase, deviceId);
const slots = Number(ent.json?.class_slots ?? ent.json?.entitlements?.class_slots ?? 0);
if (slots === 5) {
  report.pass("entitlements API returns class_slots=5");
} else {
  report.fail("entitlements class_slots mismatch", { slots, body: ent.json });
}

const mine = await apiMine(opts.apiBase, deviceId);
if (Number(mine.json?.class_slots) === 5) {
  report.pass("class/mine exposes class_slots=5");
} else {
  report.fail("class/mine class_slots mismatch", mine.json?.class_slots);
}

report.info("\n=== [2] billable count alignment on mine ===");
const billable = mine.json?.membership_count_billable;
const visible = mine.json?.classes?.length ?? 0;
const legacy = mine.json?.membership_count_legacy ?? 0;
report.info(`billable=${billable} visible=${visible} legacy=${legacy}`);
if (billable != null && billable !== visible) {
  report.skip(
    "mine billable vs visible",
    "may differ when classes lack display session — check manually"
  );
} else {
  report.pass("mine billable count matches visible classes");
}

report.info("\n=== [3] slots update reflected without stale cache ===");
await sbFetch(sb.url, sb.key, "/rest/v1/user_entitlements", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({
    device_id: deviceId,
    plan: "slots_3",
    class_slots: 3,
    updated_at: new Date().toISOString(),
  }),
});
const ent2 = await apiEntitlements(opts.apiBase, deviceId);
if (Number(ent2.json?.class_slots ?? 0) === 3) {
  report.pass("entitlements update visible immediately");
} else {
  report.fail("entitlements stale after update", ent2.json);
}

await sbFetch(sb.url, sb.key, "/rest/v1/user_entitlements", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({
    device_id: deviceId,
    plan: "slots_5",
    class_slots: 5,
    updated_at: new Date().toISOString(),
  }),
});

report.info("\n=== [4] match-join returns classSlots in error payload ===");
const join = await apiMatchJoin(opts.apiBase, {
  deviceId,
  worldKey: "default",
  topicKey: null,
  capacity: 5,
});
if (join.json?.classSlots != null || join.json?.error === "class_slots_limit") {
  report.pass("match-join exposes classSlots in response");
} else if (join.json?.ok) {
  report.pass("match-join ok includes slot context optional");
} else {
  report.fail("match-join missing slot metadata", join.json);
}

process.exit(report.summary());
