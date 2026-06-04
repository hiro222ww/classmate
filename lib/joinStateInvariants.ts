import type { SupabaseClient } from "@supabase/supabase-js";

export function tailJoinId(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return "-";
  return v.length <= 6 ? v : v.slice(-6);
}

export type JoinInvariantType =
  | "session_member_without_membership"
  | "presence_without_session_member"
  | "membership_without_session_member"
  | "session_class_mismatch"
  | "split_session"
  | "viewer_missing_from_session_members";

export function logJoinInvariantWarning(
  type: JoinInvariantType,
  params: {
    classId?: string;
    sessionId?: string;
    deviceId?: string;
    extra?: string;
  }
) {
  const parts = [
    `[join-invariant] warning type=${type}`,
    params.deviceId ? `device=${tailJoinId(params.deviceId)}` : "",
    params.sessionId ? `session=${tailJoinId(params.sessionId)}` : "",
    params.classId ? `class=${tailJoinId(params.classId)}` : "",
    params.extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  console.warn(parts);
}

export async function auditJoinStateInvariants(
  sb: SupabaseClient,
  params: {
    classId: string;
    sessionId: string;
    deviceId?: string;
    requestedClassId?: string;
    sessionClassId?: string | null;
  }
): Promise<string[]> {
  const warnings: string[] = [];
  const classId = String(params.classId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();

  const sessionClassId = String(
    params.sessionClassId ?? ""
  ).trim();

  if (sessionClassId && sessionClassId !== classId) {
    warnings.push("session_class_mismatch");
    logJoinInvariantWarning("session_class_mismatch", {
      classId,
      sessionId,
      deviceId: deviceId || undefined,
      extra: `sessionClass=${tailJoinId(sessionClassId)} requestedClass=${tailJoinId(classId)}`,
    });
  }

  if (params.requestedClassId) {
    const requested = String(params.requestedClassId).trim();
    if (requested && sessionClassId && requested !== sessionClassId) {
      logJoinInvariantWarning("session_class_mismatch", {
        classId: requested,
        sessionId,
        extra: `requestedClass=${tailJoinId(requested)} sessionClass=${tailJoinId(sessionClassId)}`,
      });
    }
  }

  if (!deviceId) {
    return warnings;
  }

  const { data: membership } = await sb
    .from("class_memberships")
    .select("class_id")
    .eq("class_id", classId)
    .eq("device_id", deviceId)
    .maybeSingle();

  const { data: sessionMember } = await sb
    .from("session_members")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("device_id", deviceId)
    .maybeSingle();

  const { data: presence } = await sb
    .from("class_presence")
    .select("class_id,session_id")
    .eq("class_id", classId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (sessionMember && !membership) {
    warnings.push("session_member_without_membership");
    logJoinInvariantWarning("session_member_without_membership", {
      classId,
      sessionId,
      deviceId,
    });
  }

  if (membership && !sessionMember) {
    warnings.push("membership_without_session_member");
    logJoinInvariantWarning("membership_without_session_member", {
      classId,
      sessionId,
      deviceId,
    });
  }

  if (presence && !sessionMember) {
    warnings.push("presence_without_session_member");
    logJoinInvariantWarning("presence_without_session_member", {
      classId,
      sessionId,
      deviceId,
    });
  }

  if (!sessionMember && membership) {
    logJoinInvariantWarning("viewer_missing_from_session_members", {
      classId,
      sessionId,
      deviceId,
    });
  }

  const { data: otherSessionRows } = await sb
    .from("session_members")
    .select("session_id")
    .eq("device_id", deviceId)
    .neq("session_id", sessionId)
    .limit(10);

  if ((otherSessionRows ?? []).length > 0 && classId) {
    const { data: classSessions } = await sb
      .from("sessions")
      .select("id,class_id,status")
      .eq("class_id", classId)
      .limit(20);

    const classSessionIds = new Set(
      (classSessions ?? []).map((r) => String(r.id ?? "").trim()).filter(Boolean)
    );

    for (const row of otherSessionRows ?? []) {
      const otherSid = String(row.session_id ?? "").trim();
      if (otherSid && classSessionIds.has(otherSid)) {
        warnings.push("split_session");
        logJoinInvariantWarning("split_session", {
          classId,
          sessionId,
          deviceId,
          extra: `otherSession=${tailJoinId(otherSid)}`,
        });
        break;
      }
    }
  }

  return warnings;
}
