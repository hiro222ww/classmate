import type { SupabaseClient } from "@supabase/supabase-js";
import type { JoinStateStepId } from "@/lib/ensureClassSessionMembership";
import { tailJoinId } from "@/lib/joinStateInvariants";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { closeEmptySessionIfNeeded } from "@/lib/sessionLifecycle";

export async function rollbackPartialJoinState(params: {
  classId: string;
  sessionId: string;
  deviceId: string;
  failedStep?: JoinStateStepId;
  client?: SupabaseClient;
}) {
  const sb = params.client ?? supabaseAdmin;
  const classId = String(params.classId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();

  if (!classId || !sessionId || !deviceId) return;

  await sb
    .from("session_members")
    .delete()
    .eq("session_id", sessionId)
    .eq("device_id", deviceId);

  await sb
    .from("class_presence")
    .delete()
    .eq("class_id", classId)
    .eq("device_id", deviceId);

  if (
    params.failedStep === "session_members" ||
    params.failedStep === "class_presence"
  ) {
    await sb
      .from("class_memberships")
      .delete()
      .eq("class_id", classId)
      .eq("device_id", deviceId);
  }

  await closeEmptySessionIfNeeded(sb, sessionId);

  console.warn(
    `[join-state] rollback class=${tailJoinId(classId)} session=${tailJoinId(sessionId)} ` +
      `device=${tailJoinId(deviceId)} failedStep=${params.failedStep ?? "-"}`
  );
}
