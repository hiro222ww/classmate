import { NOTIFICATION_EVENT_TYPES } from "@/lib/notificationEvents";

/** Email notifications are intentionally narrower than Web Push. */
export const EMAIL_NOTIFICATION_EVENT_TYPES = [
  NOTIFICATION_EVENT_TYPES.CALL_REQUEST_CREATED,
  NOTIFICATION_EVENT_TYPES.MEETING_PLAN_CREATED,
  NOTIFICATION_EVENT_TYPES.MEETING_PLAN_UPDATED,
] as const;

export type EmailNotificationEventType =
  (typeof EMAIL_NOTIFICATION_EVENT_TYPES)[number];

export function isEmailNotificationEventType(
  eventType: string
): eventType is EmailNotificationEventType {
  return (EMAIL_NOTIFICATION_EVENT_TYPES as readonly string[]).includes(
    eventType
  );
}

export function emailSubjectForEventType(eventType: string): string {
  switch (eventType) {
    case NOTIFICATION_EVENT_TYPES.CALL_REQUEST_CREATED:
      return "【Classmate】クラスメートが今話せる人を探しています";
    case NOTIFICATION_EVENT_TYPES.MEETING_PLAN_CREATED:
      return "【Classmate】次の集合時間が設定されました";
    case NOTIFICATION_EVENT_TYPES.MEETING_PLAN_UPDATED:
      return "【Classmate】集合時間が更新されました";
    default:
      return "【Classmate】お知らせ";
  }
}
