import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isExperienceFeatureEnabled } from "@/lib/experience/settings";
import { formatJstDateTime } from "@/lib/experience/time";
import type {
  ExperienceEventRow,
  ExperiencePhase,
  ExperiencePublicStatus,
} from "@/lib/experience/types";

/** Pure phase helper for UI / tests (no DB). */
export function resolveExperiencePhase(params: {
  featureEnabled: boolean;
  hasEvent: boolean;
  startsAtMs: number;
  endsAtMs: number;
  nowMs: number;
  memberCount: number;
  maxMembers: number;
  status?: string;
}): ExperiencePhase {
  if (!params.featureEnabled || !params.hasEvent) return "hidden";
  if (params.status === "cancelled") return "hidden";
  if (params.nowMs >= params.endsAtMs || params.status === "ended") {
    return "ended";
  }
  if (params.nowMs < params.startsAtMs) return "upcoming";
  if (params.memberCount >= params.maxMembers) return "full";
  return "live";
}

/** Current in-call occupancy for experience rooms (not cumulative join history). */
async function countSessionMembers(sessionId: string | null): Promise<number> {
  const sid = String(sessionId ?? "").trim();
  if (!sid) return 0;
  const { data, error } = await supabaseAdmin
    .from("session_members")
    .select("device_id")
    .eq("session_id", sid)
    .eq("is_in_call", true)
    .not("device_id", "is", null)
    .neq("device_id", "");
  if (error) return 0;
  const ids = new Set(
    (data ?? [])
      .map((r) => String((r as { device_id?: string }).device_id ?? "").trim())
      .filter(Boolean)
  );
  return ids.size;
}

/** Lazy-mark past scheduled events as ended (non-destructive). */
export async function markPastEventsEnded(now = new Date()): Promise<void> {
  await supabaseAdmin
    .from("experience_events")
    .update({ status: "ended", updated_at: now.toISOString() })
    .eq("status", "scheduled")
    .lte("ends_at", now.toISOString());
}

export async function loadRelevantEvent(
  now = new Date()
): Promise<ExperienceEventRow | null> {
  await markPastEventsEnded(now);
  const iso = now.toISOString();

  // Prefer currently live scheduled event.
  const { data: live } = await supabaseAdmin
    .from("experience_events")
    .select(
      "id, title, starts_at, ends_at, status, max_members, class_id, session_id, created_at, updated_at"
    )
    .eq("status", "scheduled")
    .lte("starts_at", iso)
    .gt("ends_at", iso)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (live) return live as ExperienceEventRow;

  // Else next upcoming.
  const { data: upcoming } = await supabaseAdmin
    .from("experience_events")
    .select(
      "id, title, starts_at, ends_at, status, max_members, class_id, session_id, created_at, updated_at"
    )
    .eq("status", "scheduled")
    .gt("starts_at", iso)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (upcoming as ExperienceEventRow) ?? null;
}

export async function getExperiencePublicStatus(
  now = new Date()
): Promise<ExperiencePublicStatus> {
  const endBehavior = {
    newJoinsAfterEnd: "rejected" as const,
    inCallAfterEnd: "may_continue_until_leave" as const,
    emptyRoomAfterEnd: "may_close" as const,
  };

  const featureEnabled = await isExperienceFeatureEnabled();
  if (!featureEnabled) {
    return {
      ok: true,
      featureEnabled: false,
      phase: "hidden",
      event: null,
      endBehavior,
    };
  }

  const event = await loadRelevantEvent(now);
  if (!event) {
    return {
      ok: true,
      featureEnabled: true,
      phase: "hidden",
      event: null,
      endBehavior,
    };
  }

  const memberCount = await countSessionMembers(event.session_id);
  const starts = new Date(event.starts_at).getTime();
  const ends = new Date(event.ends_at).getTime();
  const t = now.getTime();

  let phase: ExperiencePhase = "upcoming";
  if (t >= ends || event.status === "ended") {
    phase = "ended";
  } else if (t >= starts) {
    phase = memberCount >= event.max_members ? "full" : "live";
  }

  // Hide ended events with no successor (loadRelevantEvent already prefers live/upcoming).
  if (phase === "ended") {
    return {
      ok: true,
      featureEnabled: true,
      phase: "hidden",
      event: null,
      endBehavior,
    };
  }

  return {
    ok: true,
    featureEnabled: true,
    phase,
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      maxMembers: event.max_members,
      memberCount,
      startsAtLabelJst: formatJstDateTime(event.starts_at),
      endsAtLabelJst: formatJstDateTime(event.ends_at),
    },
    endBehavior,
  };
}
