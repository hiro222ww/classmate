import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeMeetingDeviceId } from "@/lib/meetingPlan";
import {
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventType,
} from "@/lib/notificationEvents";

const TOAST_EVENT_TYPES: NotificationEventType[] = [
  NOTIFICATION_EVENT_TYPES.CALL_REQUEST_CREATED,
  NOTIFICATION_EVENT_TYPES.MEETING_PLAN_CREATED,
  NOTIFICATION_EVENT_TYPES.MEETING_PLAN_UPDATED,
  NOTIFICATION_EVENT_TYPES.CLASS_MESSAGE_CREATED,
];

export type NotificationFeedEvent = {
  id: string;
  event_type: string;
  class_id: string;
  class_name: string;
  actor_device_id: string;
  message: string;
  toast_message: string;
  created_at: string;
};

export function formatInAppToastMessage(input: {
  event_type: string;
  message: string;
  payload?: Record<string, unknown> | null;
}): string {
  const payload = input.payload ?? {};

  switch (input.event_type) {
    case NOTIFICATION_EVENT_TYPES.CALL_REQUEST_CREATED: {
      const label = String(payload.display_label ?? "").trim();
      if (label) return label;

      const match = String(input.message ?? "").match(/^(.+?)さんが/);
      if (match?.[1]) {
        return `${match[1]}さんが今話せる人を探しています`;
      }

      return "クラスメートが今話せる人を探しています";
    }
    case NOTIFICATION_EVENT_TYPES.MEETING_PLAN_CREATED:
    case NOTIFICATION_EVENT_TYPES.MEETING_PLAN_UPDATED:
      return "次の集合時間が設定されました";
    case NOTIFICATION_EVENT_TYPES.CLASS_MESSAGE_CREATED:
      return "新しいメッセージがあります";
    default:
      return String(input.message ?? "").trim() || "新しいお知らせがあります";
  }
}

export async function fetchNotificationFeedEvents(input: {
  deviceId: string;
  since?: string | null;
  limit?: number;
}) {
  const deviceId = normalizeMeetingDeviceId(input.deviceId);
  if (!deviceId) {
    return { ok: false as const, error: "device_id_missing", status: 401 };
  }

  const { data: memberships, error: membershipErr } = await supabaseAdmin
    .from("class_memberships")
    .select("class_id")
    .eq("device_id", deviceId);

  if (membershipErr) {
    return {
      ok: false as const,
      error: "membership_lookup_failed",
      detail: membershipErr.message,
      status: 500,
    };
  }

  const classIds = Array.from(
    new Set(
      (memberships ?? [])
        .map((row) => String((row as { class_id?: string }).class_id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (classIds.length === 0) {
    return {
      ok: true as const,
      events: [] as NotificationFeedEvent[],
      cursor: input.since ?? new Date().toISOString(),
    };
  }

  const since = String(input.since ?? "").trim();
  const nowIso = new Date().toISOString();
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);

  let query = supabaseAdmin
    .from("notification_events")
    .select(
      "id, event_type, class_id, actor_device_id, message, payload, created_at, expires_at"
    )
    .in("class_id", classIds)
    .neq("actor_device_id", deviceId)
    .in("event_type", TOAST_EVENT_TYPES)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data, error } = await query;

  if (error) {
    return {
      ok: false as const,
      error: "notification_feed_failed",
      detail: error.message,
      status: 500,
    };
  }

  const eventClassIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) => String((row as { class_id?: string }).class_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const classNameMap = new Map<string, string>();
  if (eventClassIds.length > 0) {
    const { data: classRows } = await supabaseAdmin
      .from("classes")
      .select("id, name")
      .in("id", eventClassIds);

    for (const row of classRows ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const name = String((row as { name?: string }).name ?? "").trim();
      if (id) classNameMap.set(id, name || "クラス");
    }
  }

  const events: NotificationFeedEvent[] = (data ?? [])
    .filter((row) => {
      const expiresAt = String(
        (row as { expires_at?: string | null }).expires_at ?? ""
      ).trim();
      if (!expiresAt) return true;
      const t = new Date(expiresAt).getTime();
      return Number.isFinite(t) && t > new Date(nowIso).getTime();
    })
    .map((row) => {
    const classId = String((row as { class_id?: string }).class_id ?? "").trim();
    const payload =
      ((row as { payload?: Record<string, unknown> }).payload as
        | Record<string, unknown>
        | null
        | undefined) ?? {};

    return {
      id: String((row as { id?: string }).id ?? ""),
      event_type: String((row as { event_type?: string }).event_type ?? ""),
      class_id: classId,
      class_name: classNameMap.get(classId) ?? "クラス",
      actor_device_id: String(
        (row as { actor_device_id?: string }).actor_device_id ?? ""
      ),
      message: String((row as { message?: string }).message ?? ""),
      toast_message: formatInAppToastMessage({
        event_type: String((row as { event_type?: string }).event_type ?? ""),
        message: String((row as { message?: string }).message ?? ""),
        payload,
      }),
      created_at: String((row as { created_at?: string }).created_at ?? ""),
    };
  });

  const cursor =
    events.length > 0
      ? events[events.length - 1].created_at
      : since || new Date().toISOString();

  return { ok: true as const, events, cursor };
}
