import {
  captureUtmFromLocation,
  hasAnyUtm,
  type UtmParams,
} from "@/lib/marketing/utmParse";

/** Known product funnel event names for random-call launch. */
export const FUNNEL_EVENT_NAMES = [
  "min_profile_saved",
  "talk_cta_clicked",
  "chat_cta_clicked",
  "lobby_joined",
  "call_started",
  "class_vote_yes",
  "class_promoted",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

export function isFunnelEventName(value: unknown): value is FunnelEventName {
  return FUNNEL_EVENT_NAMES.includes(String(value ?? "").trim() as FunnelEventName);
}

export type TrackFunnelEventParams = {
  eventName: FunnelEventName;
  deviceId?: string | null;
  sessionId?: string | null;
  classId?: string | null;
  meta?: Record<string, unknown> | null;
};

/**
 * Fire-and-forget client helper. Never throws; failures are swallowed.
 */
export async function trackFunnelEvent(
  params: TrackFunnelEventParams
): Promise<void> {
  if (typeof window === "undefined") return;

  const eventName = String(params.eventName ?? "").trim();
  if (!isFunnelEventName(eventName)) return;

  const deviceId = String(params.deviceId ?? "").trim() || undefined;
  const sessionId = String(params.sessionId ?? "").trim() || undefined;
  const classId = String(params.classId ?? "").trim() || undefined;
  const baseMeta =
    params.meta && typeof params.meta === "object" && !Array.isArray(params.meta)
      ? { ...params.meta }
      : {};

  // Attach first-touch UTM for marketing attribution (campaign params only).
  try {
    const utm: UtmParams = captureUtmFromLocation();
    if (hasAnyUtm(utm)) {
      if (utm.utm_source) baseMeta.utm_source = utm.utm_source;
      if (utm.utm_medium) baseMeta.utm_medium = utm.utm_medium;
      if (utm.utm_campaign) baseMeta.utm_campaign = utm.utm_campaign;
      if (utm.utm_content) baseMeta.utm_content = utm.utm_content;
    }
  } catch {
    // ignore storage failures
  }

  const meta = Object.keys(baseMeta).length > 0 ? baseMeta : undefined;

  try {
    await fetch("/api/funnel-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventName,
        deviceId,
        sessionId,
        classId,
        meta,
      }),
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // ignore network errors
  }
}
