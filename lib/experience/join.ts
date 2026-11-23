import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBlockedDeviceIdsForActor } from "@/lib/actorIdentity";
import type { ExperienceJoinResult } from "@/lib/experience/types";

export async function joinExperienceEvent(params: {
  eventId: string;
  deviceId: string;
  displayName: string;
  userId?: string | null;
}): Promise<ExperienceJoinResult> {
  const eventId = String(params.eventId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();
  const displayName = String(params.displayName ?? "").trim() || "参加者";
  const userId = params.userId ? String(params.userId).trim() : null;

  if (!eventId || !deviceId) {
    return { ok: false, error: "missing_params" };
  }

  // Soft block gate: if any current member is blocked either way, reject.
  const { data: eventRow } = await supabaseAdmin
    .from("experience_events")
    .select("session_id")
    .eq("id", eventId)
    .maybeSingle();
  const sessionId = String(eventRow?.session_id ?? "").trim();
  if (sessionId) {
    const { data: members } = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionId)
      .eq("is_in_call", true)
      .not("device_id", "is", null);
    const peerIds = (members ?? [])
      .map((m) => String((m as { device_id?: string }).device_id ?? "").trim())
      .filter((id) => id && id !== deviceId);
    if (peerIds.length) {
      const blocked = await fetchBlockedDeviceIdsForActor(supabaseAdmin, {
        deviceId,
        userId,
      });
      const blockedSet = new Set(blocked);
      if (peerIds.some((id) => blockedSet.has(id))) {
        return { ok: false, error: "blocked_peer" };
      }
    }
  }

  const { data, error } = await supabaseAdmin.rpc("experience_event_join", {
    p_event_id: eventId,
    p_device_id: deviceId,
    p_display_name: displayName,
    p_user_id: userId,
  });

  if (error) {
    return { ok: false, error: error.message || "join_rpc_failed" };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (!row.ok) {
    return {
      ok: false,
      error: String(row.error ?? "join_failed"),
      memberCount:
        typeof row.member_count === "number" ? row.member_count : undefined,
      maxMembers:
        typeof row.max_members === "number" ? row.max_members : undefined,
    };
  }

  return {
    ok: true,
    eventId: String(row.event_id ?? eventId),
    sessionId: String(row.session_id ?? ""),
    classId: String(row.class_id ?? ""),
    memberCount: Number(row.member_count ?? 0),
    maxMembers: Number(row.max_members ?? 5),
    endsAt: String(row.ends_at ?? ""),
    rejoined: Boolean(row.rejoined),
  };
}

export async function leaveExperienceEvent(params: {
  eventId?: string | null;
  sessionId: string;
  deviceId: string;
}): Promise<{ ok: boolean; error?: string; remaining?: number }> {
  const sessionId = String(params.sessionId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();
  if (!sessionId || !deviceId) {
    return { ok: false, error: "missing_session_or_device" };
  }

  const now = new Date();
  const { data: experienceEvent } = await supabaseAdmin
    .from("experience_events")
    .select("id, class_id, ends_at, status")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!experienceEvent?.id) {
    return { ok: false, error: "not_experience_session" };
  }

  const eventId =
    String(params.eventId ?? "").trim() || String(experienceEvent.id);

  const joinedAtRes = await supabaseAdmin
    .from("experience_participations")
    .select("id, joined_at, event_id")
    .eq("event_id", eventId)
    .eq("device_id", deviceId)
    .is("left_at", null)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Free the seat immediately (出入り自由 — do not keep cumulative roster rows).
  const { error: deleteErr } = await supabaseAdmin
    .from("session_members")
    .delete()
    .eq("session_id", sessionId)
    .eq("device_id", deviceId);

  if (deleteErr) return { ok: false, error: deleteErr.message };

  const classId = String(experienceEvent.class_id ?? "").trim();
  if (classId) {
    await supabaseAdmin
      .from("class_memberships")
      .update({
        status: "left",
        left_at: now.toISOString(),
      })
      .eq("class_id", classId)
      .eq("device_id", deviceId)
      .eq("status", "active");
  }

  if (joinedAtRes.data?.id) {
    const joinedAt = new Date(String(joinedAtRes.data.joined_at)).getTime();
    const talkSeconds = Number.isFinite(joinedAt)
      ? Math.max(0, Math.floor((now.getTime() - joinedAt) / 1000))
      : 0;
    await supabaseAdmin
      .from("experience_participations")
      .update({
        left_at: now.toISOString(),
        talk_seconds: talkSeconds,
      })
      .eq("id", joinedAtRes.data.id);
  }

  // Keep room open while event is live (even at 0 members).
  const liveEvent =
    String(experienceEvent.status ?? "") === "scheduled" &&
    new Date(String(experienceEvent.ends_at)).getTime() > now.getTime()
      ? experienceEvent
      : null;

  const { count } = await supabaseAdmin
    .from("session_members")
    .select("device_id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("is_in_call", true)
    .not("device_id", "is", null)
    .neq("device_id", "");

  const remaining = count ?? 0;

  if (!liveEvent && remaining === 0) {
    await supabaseAdmin
      .from("sessions")
      .update({ status: "closed" })
      .eq("id", sessionId);
  }

  return { ok: true, remaining };
}

/** True when session belongs to a still-live experience event. */
export async function isLiveExperienceSession(
  sessionId: string
): Promise<boolean> {
  const sid = String(sessionId ?? "").trim();
  if (!sid) return false;
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("experience_events")
    .select("id")
    .eq("session_id", sid)
    .eq("status", "scheduled")
    .gt("ends_at", now)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}
