import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeMeetingDeviceId } from "@/lib/meetingPlan";

export type PushSubscriptionRow = {
  id: string;
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
  created_at: string;
  updated_at: string;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export function normalizePushSubscriptionInput(raw: unknown): PushSubscriptionInput | null {
  const obj = raw as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };

  const endpoint = String(obj?.endpoint ?? "").trim();
  const p256dh = String(obj?.keys?.p256dh ?? "").trim();
  const auth = String(obj?.keys?.auth ?? "").trim();

  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export async function upsertPushSubscription(input: {
  deviceId: string;
  subscription: PushSubscriptionInput;
  userAgent?: string | null;
}) {
  const deviceId = normalizeMeetingDeviceId(input.deviceId);
  if (!deviceId) {
    return { ok: false as const, error: "device_id_missing" };
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
    {
      device_id: deviceId,
      endpoint: input.subscription.endpoint,
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      user_agent: input.userAgent ?? null,
      updated_at: now,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

export async function deletePushSubscriptionByEndpoint(endpoint: string) {
  const normalized = String(endpoint ?? "").trim();
  if (!normalized) return { ok: true as const };

  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", normalized);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

export async function loadPushSubscriptionsForDevices(deviceIds: string[]) {
  const ids = Array.from(
    new Set(deviceIds.map((id) => normalizeMeetingDeviceId(id)).filter(Boolean))
  );

  if (ids.length === 0) return [] as PushSubscriptionRow[];

  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, device_id, endpoint, p256dh, auth, user_agent, created_at, updated_at")
    .in("device_id", ids);

  if (error) {
    console.warn("[pushSubscriptions] load failed", error.message);
    return [] as PushSubscriptionRow[];
  }

  return (data ?? []) as PushSubscriptionRow[];
}
