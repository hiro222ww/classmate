import { supabaseAdmin } from "@/lib/supabaseAdmin";

function normalizeDeviceId(v: unknown) {
  return String(v ?? "").trim();
}

export async function canViewMemberProfile(params: {
  viewerDeviceId: string;
  targetDeviceId: string;
  classId?: string;
  sessionId?: string;
}): Promise<boolean> {
  const viewerDeviceId = normalizeDeviceId(params.viewerDeviceId);
  const targetDeviceId = normalizeDeviceId(params.targetDeviceId);
  const classId = normalizeDeviceId(params.classId);
  const sessionId = normalizeDeviceId(params.sessionId);

  if (!viewerDeviceId || !targetDeviceId) return false;
  if (viewerDeviceId === targetDeviceId) return true;

  if (sessionId) {
    const { data, error } = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionId)
      .in("device_id", [viewerDeviceId, targetDeviceId]);

    if (error) return false;

    const ids = new Set(
      (data ?? [])
        .map((row) => normalizeDeviceId(row.device_id))
        .filter(Boolean)
    );

    if (!ids.has(viewerDeviceId) || !ids.has(targetDeviceId)) {
      return false;
    }

    if (!classId) return true;

    const { data: sessionRow, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select("class_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !sessionRow) return false;

    return normalizeDeviceId(sessionRow.class_id) === classId;
  }

  if (classId) {
    const { data, error } = await supabaseAdmin
      .from("class_memberships")
      .select("device_id")
      .eq("class_id", classId)
      .in("device_id", [viewerDeviceId, targetDeviceId]);

    if (error) return false;

    const ids = new Set(
      (data ?? [])
        .map((row) => normalizeDeviceId(row.device_id))
        .filter(Boolean)
    );

    return ids.has(viewerDeviceId) && ids.has(targetDeviceId);
  }

  return false;
}
