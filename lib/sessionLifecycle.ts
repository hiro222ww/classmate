import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After removing a session_member row, close the session when no real members remain.
 */
export async function closeEmptySessionIfNeeded(
  sb: SupabaseClient,
  sessionId: string
): Promise<{ closed: boolean; remaining: number }> {
  const normalizedSessionId = String(sessionId ?? "").trim();
  if (!normalizedSessionId) {
    return { closed: false, remaining: 0 };
  }

  const { data: remainingRows, error: countErr } = await sb
    .from("session_members")
    .select("device_id")
    .eq("session_id", normalizedSessionId)
    .not("device_id", "is", null)
    .neq("device_id", "");

  if (countErr) {
    console.warn(
      `[session-lifecycle] count-failed session=${normalizedSessionId.slice(-6)} err=${countErr.message}`
    );
    return { closed: false, remaining: -1 };
  }

  const uniqueIds = new Set(
    (remainingRows ?? [])
      .map((row) => String((row as { device_id?: unknown }).device_id ?? "").trim())
      .filter(Boolean)
  );
  const remaining = uniqueIds.size;

  if (remaining > 0) {
    return { closed: false, remaining };
  }

  const { error: closeErr } = await sb
    .from("sessions")
    .update({ status: "closed" })
    .eq("id", normalizedSessionId);

  if (closeErr) {
    console.warn(
      `[session-lifecycle] close-failed session=${normalizedSessionId.slice(-6)} err=${closeErr.message}`
    );
    return { closed: false, remaining: 0 };
  }

  console.log(
    `[session-lifecycle] close-empty-session session=${normalizedSessionId.slice(-6)}`
  );
  return { closed: true, remaining: 0 };
}
