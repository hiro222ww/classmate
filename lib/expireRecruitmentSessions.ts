import type { SupabaseClient } from "@supabase/supabase-js";

export function recruitmentSessionCutoffIso(ttlMinutes: number) {
  return new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();
}

export async function expireStaleRecruitmentSessions(
  sb: SupabaseClient,
  params: {
    ttlMinutes: number | null;
    classIds?: string[];
    /** Do not expire recruiting sessions that still have session_members. */
    keepSessionsWithMembers?: boolean;
  }
) {
  if (params.ttlMinutes === null) {
    return {
      ok: true,
      error: null,
      cutoff: null,
      skipped: true,
    };
  }

  const cutoff = recruitmentSessionCutoffIso(params.ttlMinutes);

  if (params.keepSessionsWithMembers) {
    let sessionQuery = sb
      .from("sessions")
      .select("id")
      .in("status", ["forming", "waiting"])
      .lt("created_at", cutoff);

    if (params.classIds?.length) {
      sessionQuery = sessionQuery.in("class_id", params.classIds);
    }

    const { data: staleSessions, error: lookupErr } = await sessionQuery;
    if (lookupErr) {
      return {
        ok: false,
        error: lookupErr.message,
        cutoff,
      };
    }

    const staleIds = (staleSessions ?? [])
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean);

    if (staleIds.length === 0) {
      return { ok: true, error: null, cutoff };
    }

    const { data: memberRows, error: memberErr } = await sb
      .from("session_members")
      .select("session_id")
      .in("session_id", staleIds);

    if (memberErr) {
      return {
        ok: false,
        error: memberErr.message,
        cutoff,
      };
    }

    const occupied = new Set(
      (memberRows ?? [])
        .map((row) => String(row.session_id ?? "").trim())
        .filter(Boolean)
    );
    const expireIds = staleIds.filter((id) => !occupied.has(id));

    if (expireIds.length === 0) {
      return { ok: true, error: null, cutoff };
    }

    const { error } = await sb
      .from("sessions")
      .update({ status: "expired" })
      .in("id", expireIds);

    return {
      ok: !error,
      error: error?.message ?? null,
      cutoff,
    };
  }

  let query = sb
    .from("sessions")
    .update({ status: "expired" })
    .in("status", ["forming", "waiting"])
    .lt("created_at", cutoff);

  if (params.classIds?.length) {
    query = query.in("class_id", params.classIds);
  }

  const { error } = await query;

  return {
    ok: !error,
    error: error?.message ?? null,
    cutoff,
  };
}
