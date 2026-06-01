import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Durable notification event log for future Push / in-app badge delivery.
 *
 * Flow (future):
 *   domain action → recordNotificationEvent() → notification_events row
 *   → push worker reads push_sent_at IS NULL → sends Web Push → sets push_sent_at
 *
 * Event types are stable strings so workers and clients can subscribe by type.
 */
export const NOTIFICATION_EVENT_TYPES = {
  CALL_REQUEST_CREATED: "call_request_created",
  CALL_REQUEST_CANCELED: "call_request_canceled",
  MEETING_PLAN_CREATED: "meeting_plan_created",
  MEETING_PLAN_UPDATED: "meeting_plan_updated",
  MEETING_PLAN_CANCELED: "meeting_plan_canceled",
  CLASS_MESSAGE_CREATED: "class_message_created",
} as const;

export type NotificationEventType =
  (typeof NOTIFICATION_EVENT_TYPES)[keyof typeof NOTIFICATION_EVENT_TYPES];

export const NOTIFICATION_TARGET_SCOPES = {
  CLASS_MEMBERS: "class_members",
  ACTOR_ONLY: "actor_only",
} as const;

export type NotificationTargetScope =
  (typeof NOTIFICATION_TARGET_SCOPES)[keyof typeof NOTIFICATION_TARGET_SCOPES];

export type RecordNotificationEventInput = {
  eventType: NotificationEventType;
  classId: string;
  actorDeviceId: string;
  message: string;
  targetScope?: NotificationTargetScope;
  sourceId?: string | null;
  expiresAt?: string | null;
  payload?: Record<string, unknown>;
};

export type NotificationEventRow = {
  id: string;
  event_type: string;
  class_id: string | null;
  actor_device_id: string;
  target_scope: string;
  message: string;
  payload: Record<string, unknown>;
  source_id: string | null;
  created_at: string;
  expires_at: string | null;
  push_sent_at: string | null;
  push_skipped_reason: string | null;
};

export async function recordNotificationEvent(
  input: RecordNotificationEventInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const classId = String(input.classId ?? "").trim();
  const actorDeviceId = String(input.actorDeviceId ?? "").trim();
  const message = String(input.message ?? "").trim();

  if (!classId || !actorDeviceId || !message) {
    return { ok: false, error: "invalid_notification_event_input" };
  }

  const pushSkippedReason =
    input.eventType === NOTIFICATION_EVENT_TYPES.CALL_REQUEST_CREATED
      ? null
      : "push_not_implemented";

  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .insert({
      event_type: input.eventType,
      class_id: classId,
      actor_device_id: actorDeviceId,
      target_scope: input.targetScope ?? NOTIFICATION_TARGET_SCOPES.CLASS_MEMBERS,
      message,
      payload: input.payload ?? {},
      source_id: input.sourceId ?? null,
      expires_at: input.expiresAt ?? null,
      push_skipped_reason: pushSkippedReason,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[notificationEvents] insert failed", {
      eventType: input.eventType,
      classId,
      detail: error.message,
    });
    return { ok: false, error: error.message };
  }

  return { ok: true, id: String((data as { id?: string }).id ?? "") };
}

export async function emitCallRequestCreatedEvent(input: {
  classId: string;
  actorDeviceId: string;
  callRequestId: string;
  message: string;
  expiresAt: string;
  displayLabel: string;
}) {
  return recordNotificationEvent({
    eventType: NOTIFICATION_EVENT_TYPES.CALL_REQUEST_CREATED,
    classId: input.classId,
    actorDeviceId: input.actorDeviceId,
    message: input.message,
    sourceId: input.callRequestId,
    expiresAt: input.expiresAt,
    payload: {
      call_request_id: input.callRequestId,
      display_label: input.displayLabel,
      expires_at: input.expiresAt,
    },
  });
}

export async function emitMeetingPlanEvent(input: {
  classId: string;
  actorDeviceId: string;
  meetingPlanId: string;
  message: string;
  scheduledAt: string;
  isUpdate: boolean;
}) {
  return recordNotificationEvent({
    eventType: input.isUpdate
      ? NOTIFICATION_EVENT_TYPES.MEETING_PLAN_UPDATED
      : NOTIFICATION_EVENT_TYPES.MEETING_PLAN_CREATED,
    classId: input.classId,
    actorDeviceId: input.actorDeviceId,
    message: input.message,
    sourceId: input.meetingPlanId,
    payload: {
      meeting_plan_id: input.meetingPlanId,
      scheduled_at: input.scheduledAt,
    },
  });
}

export async function emitClassMessageCreatedEvent(input: {
  classId: string;
  actorDeviceId: string;
  message: string;
  classMessageId?: string | number | null;
}) {
  return recordNotificationEvent({
    eventType: NOTIFICATION_EVENT_TYPES.CLASS_MESSAGE_CREATED,
    classId: input.classId,
    actorDeviceId: input.actorDeviceId,
    message: input.message,
    sourceId: input.classMessageId ? String(input.classMessageId) : null,
    payload: {
      class_message_id: input.classMessageId ?? null,
      preview: input.message.slice(0, 120),
    },
  });
}
