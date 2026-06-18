import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatInAppToastMessage } from "@/lib/notificationFeed";
import {
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventRow,
} from "@/lib/notificationEvents";
import {
  deletePushSubscriptionByEndpoint,
  loadPushSubscriptionsForDevices,
} from "@/lib/pushSubscriptions";
import { buildAppUrl } from "@/lib/appOrigin";
import { normalizeMeetingDeviceId } from "@/lib/meetingPlan";

type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  classId: string;
};

function getVapidConfig() {
  const publicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = String(
    process.env.VAPID_SUBJECT ?? "mailto:support@classmate.app"
  ).trim();

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

function buildPushOpenUrl(classId: string) {
  return buildAppUrl(`/?pushOpenClassId=${encodeURIComponent(classId)}`);
}

async function markNotificationPushSent(eventId: string) {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("notification_events")
    .update({ push_sent_at: now, push_skipped_reason: null })
    .eq("id", eventId);
}

async function markNotificationPushSkipped(eventId: string, reason: string) {
  await supabaseAdmin
    .from("notification_events")
    .update({ push_skipped_reason: reason })
    .eq("id", eventId);
}

function buildCallRequestPushPayload(
  event: NotificationEventRow,
  classId: string
): WebPushPayload {
  const payload =
    (event.payload as Record<string, unknown> | null | undefined) ?? {};

  const body = formatInAppToastMessage({
    event_type: event.event_type,
    message: event.message,
    payload,
  });

  return {
    title: "Classmate",
    body,
    classId,
    url: buildPushOpenUrl(classId),
  };
}

export async function dispatchCallRequestWebPush(eventId: string) {
  const normalizedEventId = String(eventId ?? "").trim();
  if (!normalizedEventId) {
    return { ok: false as const, error: "event_id_missing" };
  }

  const vapid = getVapidConfig();
  if (!vapid) {
    await markNotificationPushSkipped(normalizedEventId, "vapid_not_configured");
    return { ok: false as const, error: "vapid_not_configured" };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const { data: event, error: eventErr } = await supabaseAdmin
    .from("notification_events")
    .select(
      "id, event_type, class_id, actor_device_id, message, payload, created_at, expires_at, push_sent_at"
    )
    .eq("id", normalizedEventId)
    .maybeSingle();

  if (eventErr || !event) {
    await markNotificationPushSkipped(normalizedEventId, "event_not_found");
    return { ok: false as const, error: "event_not_found" };
  }

  const row = event as NotificationEventRow;

  if (row.event_type !== NOTIFICATION_EVENT_TYPES.CALL_REQUEST_CREATED) {
    await markNotificationPushSkipped(normalizedEventId, "push_event_type_skipped");
    return { ok: false as const, error: "push_event_type_skipped" };
  }

  if (row.push_sent_at) {
    return { ok: true as const, skipped: true, reason: "already_sent" };
  }

  const classId = String(row.class_id ?? "").trim();
  const actorDeviceId = normalizeMeetingDeviceId(row.actor_device_id);
  if (!classId || !actorDeviceId) {
    await markNotificationPushSkipped(normalizedEventId, "invalid_event");
    return { ok: false as const, error: "invalid_event" };
  }

  const { data: memberships, error: membershipErr } = await supabaseAdmin
    .from("class_memberships")
    .select("device_id")
    .eq("class_id", classId);

  if (membershipErr) {
    await markNotificationPushSkipped(normalizedEventId, "membership_lookup_failed");
    return { ok: false as const, error: "membership_lookup_failed" };
  }

  const targetDeviceIds = (memberships ?? [])
    .map((m) => normalizeMeetingDeviceId((m as { device_id?: string }).device_id))
    .filter((id) => id && id !== actorDeviceId);

  const subscriptions = (
    await loadPushSubscriptionsForDevices(targetDeviceIds)
  ).filter(
    (sub) => normalizeMeetingDeviceId(sub.device_id) !== actorDeviceId
  );
  if (subscriptions.length === 0) {
    await markNotificationPushSkipped(normalizedEventId, "no_subscribers");
    return { ok: true as const, skipped: true, reason: "no_subscribers" };
  }

  const pushPayload = buildCallRequestPushPayload(row, classId);
  let sentCount = 0;
  let failedCount = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(pushPayload)
      );
      sentCount += 1;
    } catch (e: unknown) {
      failedCount += 1;
      const statusCode = Number(
        (e as { statusCode?: number }).statusCode ??
          (e as { status?: number }).status ??
          0
      );
      if (statusCode === 404 || statusCode === 410) {
        await deletePushSubscriptionByEndpoint(sub.endpoint);
      }
      console.warn("[webPush] send failed", {
        endpoint: sub.endpoint,
        statusCode,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (sentCount > 0) {
    await markNotificationPushSent(normalizedEventId);
    return { ok: true as const, sentCount, failedCount };
  }

  await markNotificationPushSkipped(normalizedEventId, "send_failed");
  return { ok: false as const, error: "send_failed", failedCount };
}
