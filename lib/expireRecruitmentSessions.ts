import type { SupabaseClient } from "@supabase/supabase-js";

export function recruitmentSessionCutoffIso(ttlMinutes: number) {
  return new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();
}

export async function expireStaleRecruitmentSessions(
  sb: SupabaseClient,
  params: {
    ttlMinutes: number | null;
    classIds?: string[];
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
