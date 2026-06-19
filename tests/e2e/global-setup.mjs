/**
 * Ensures E2E dev devices have profiles, entitlements, and a clean membership slate.
 */
import {
  devDeviceId,
  ensureDevDevices,
  resolveSupabaseConfig,
  sbFetch,
} from "../../scripts/lib/prelaunch-test-utils.mjs";

const E2E_DEV_KEYS = ["1", "51", "52", "53", "61", "62", "81", "91", "92", "93"];
const CLASS_SLOTS = 25;

async function cleanupDeviceMemberships(sb, deviceId) {
  const tables = ["class_presence", "session_members", "class_memberships"];
  for (const table of tables) {
    await sbFetch(
      sb.url,
      sb.key,
      `/rest/v1/${table}?device_id=eq.${encodeURIComponent(deviceId)}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      }
    );
  }
}

export default async function globalSetup() {
  const sb = resolveSupabaseConfig({
    apiBase: process.env.BASE_URL || "http://localhost:3000",
    envFile: ".env.local",
  });

  if (!sb.url || !sb.key) {
    console.warn("[e2e global-setup] skip: Supabase env missing");
    return;
  }

  console.log("[e2e global-setup] preparing dev devices:", E2E_DEV_KEYS.join(", "));

  for (const devKey of E2E_DEV_KEYS) {
    await cleanupDeviceMemberships(sb, devDeviceId(devKey));
  }

  await ensureDevDevices(sb, sb, E2E_DEV_KEYS, CLASS_SLOTS, {
    displayNamePrefix: "E2E",
  });

  console.log("[e2e global-setup] done");
}
