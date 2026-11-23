import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * True when this call session is (or was) the room for a limited-time
 * experience event. Experience rooms must not offer free-match → class promote.
 */
export async function sessionBelongsToExperienceEvent(
  sessionId: string
): Promise<boolean> {
  const sid = String(sessionId ?? "").trim();
  if (!sid) return false;
  const { data, error } = await supabaseAdmin
    .from("experience_events")
    .select("id")
    .eq("session_id", sid)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(
      `[experience] session-lookup-failed session=${sid.slice(-6)} err=${error.message}`
    );
    return false;
  }
  return Boolean(data?.id);
}
