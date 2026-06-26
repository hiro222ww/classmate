/**
 * Web Push platform constraints.
 *
 * Chrome / Edge (desktop & Android):
 * - Service Worker + PushManager + Notification permission required.
 * - Works on https:// or http://localhost.
 *
 * iOS Safari (16.4+):
 * - Web Push requires the site to be added to Home Screen (PWA / standalone).
 * - User must grant notification permission inside the installed web app.
 * - Push silently fails or never arrives if opened only in a regular Safari tab.
 * - Apple may throttle background delivery; treat as best-effort.
 *
 * Firefox:
 * - Supported on desktop/Android with similar SW + permission flow.
 *
 * Operational notes:
 * - VAPID keys must be configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).
 * - Expired subscriptions (HTTP 410) should be deleted from push_subscriptions.
 */

export const WEB_PUSH_SUPPORTED_EVENT_TYPES = [
  "call_request_created",
  "class_message_created",
  "meeting_plan_created",
  "meeting_plan_updated",
] as const;

export type WebPushSupportedEventType =
  (typeof WEB_PUSH_SUPPORTED_EVENT_TYPES)[number];

export function isWebPushEnabledEventType(
  eventType: string
): eventType is WebPushSupportedEventType {
  return (WEB_PUSH_SUPPORTED_EVENT_TYPES as readonly string[]).includes(
    eventType
  );
}
