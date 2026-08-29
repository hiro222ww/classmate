import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Mirrors SQL `session_open_for_match_join`: a session is a free-queue
 * merge candidate only while unlocked and within an open join window.
 * Locked sessions and elapsed join_open_until are excluded (no late join / refill).
 */
export function isSessionOpenForMatchJoin(params: {
  membersLockedAt: string | null | undefined;
  joinOpenUntil: string | null | undefined;
  nowMs?: number;
}): boolean {
  if (params.membersLockedAt) return false;
  if (!params.joinOpenUntil) return true;
  const openUntil = new Date(String(params.joinOpenUntil)).getTime();
  if (!Number.isFinite(openUntil)) return true;
  const now = params.nowMs ?? Date.now();
  return now < openUntil;
}

/**
 * If the join window has elapsed, set members_locked_at (idempotent).
 * Returns whether the session is locked after this call.
 */
export async function ensureSessionMembersLockedIfDue(
  sessionId: string
): Promise<{ locked: boolean; error: string | null }> {
  const id = String(sessionId ?? "").trim();
  if (!id) return { locked: false, error: "invalid_sessionId" };

  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("id, members_locked_at, join_open_until, capacity")
    .eq("id", id)
    .maybeSingle();

  if (error) return { locked: false, error: error.message };
  if (!data) return { locked: false, error: "session_not_found" };

  if (data.members_locked_at) {
    return { locked: true, error: null };
  }

  const openUntil = data.join_open_until
    ? new Date(String(data.join_open_until)).getTime()
    : null;
  const windowExpired =
    openUntil != null && Number.isFinite(openUntil) && Date.now() >= openUntil;

  const { count, error: countErr } = await supabaseAdmin
    .from("session_members")
    .select("device_id", { count: "exact", head: true })
    .eq("session_id", id);

  if (countErr) return { locked: false, error: countErr.message };

  const capacity = Number(data.capacity ?? 5);
  const atCapacity =
    Number.isFinite(capacity) &&
    capacity > 0 &&
    Number(count ?? 0) >= capacity;

  if (!windowExpired && !atCapacity) {
    return { locked: false, error: null };
  }

  const { error: lockErr } = await supabaseAdmin
    .from("sessions")
    .update({
      members_locked_at: new Date().toISOString(),
      join_open_until:
        data.join_open_until ?? new Date().toISOString(),
    })
    .eq("id", id)
    .is("members_locked_at", null);

  if (lockErr) return { locked: false, error: lockErr.message };
  return { locked: true, error: null };
}
