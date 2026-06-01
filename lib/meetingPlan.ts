import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveDisplayName } from "@/lib/resolveDisplayName";
import {
  formatMeetingPlanJst,
  type MeetingPlanPublic,
  type MeetingPlanRow,
  normalizeMeetingClassId,
  normalizeMeetingDeviceId,
  toMeetingPlanPublic,
} from "@/lib/meetingPlanClient";

export type { MeetingPlanPublic, MeetingPlanRow } from "@/lib/meetingPlanClient";
export {
  formatMeetingPlanJst,
  isoToJstDatetimeLocalInput,
  isMeetingPlanPast,
  jstDatetimeLocalInputToIso,
  normalizeMeetingClassId,
  normalizeMeetingDeviceId,
  toMeetingPlanPublic,
} from "@/lib/meetingPlanClient";

export async function assertClassMembership(deviceId: string, classId: string) {
  const { data, error } = await supabaseAdmin
    .from("class_memberships")
    .select("class_id")
    .eq("device_id", deviceId)
    .eq("class_id", classId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      status: 500,
      error: "membership_lookup_failed",
      detail: error.message,
    };
  }

  if (!data) {
    return { ok: false as const, status: 403, error: "not_member" };
  }

  return { ok: true as const };
}

export async function fetchActiveMeetingPlan(classId: string) {
  const { data, error } = await supabaseAdmin
    .from("class_meeting_plans")
    .select(
      "id, class_id, scheduled_at, note, created_by_device_id, created_at, canceled_at"
    )
    .eq("class_id", classId)
    .is("canceled_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false as const, error };
  }

  if (!data) {
    return { ok: true as const, plan: null };
  }

  return { ok: true as const, plan: data as MeetingPlanRow };
}

export async function fetchActiveMeetingPlansForClasses(classIds: string[]) {
  const ids = Array.from(new Set(classIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return new Map<string, MeetingPlanPublic>();
  }

  const { data, error } = await supabaseAdmin
    .from("class_meeting_plans")
    .select(
      "id, class_id, scheduled_at, note, created_by_device_id, created_at, canceled_at"
    )
    .in("class_id", ids)
    .is("canceled_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return null;
  }

  const map = new Map<string, MeetingPlanPublic>();
  for (const row of data ?? []) {
    const classId = String((row as MeetingPlanRow).class_id ?? "").trim();
    if (!classId || map.has(classId)) continue;
    map.set(classId, toMeetingPlanPublic(row as MeetingPlanRow));
  }

  return map;
}

export async function cancelActiveMeetingPlans(classId: string) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("class_meeting_plans")
    .update({ canceled_at: now })
    .eq("class_id", classId)
    .is("canceled_at", null);

  return { ok: !error, error };
}

async function loadDisplayName(deviceId: string) {
  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("display_name")
    .eq("device_id", deviceId)
    .maybeSingle();

  const resolved = resolveDisplayName({
    profileDisplayName: (data as { display_name?: string | null } | null)
      ?.display_name,
  });

  return resolved.displayName;
}

export async function postMeetingPlanSystemMessage(input: {
  deviceId: string;
  classId: string;
  message: string;
}) {
  const trimmed = String(input.message ?? "").trim();
  if (!trimmed) return { ok: true as const };

  const { error } = await supabaseAdmin.rpc("post_class_message", {
    p_device_id: input.deviceId,
    p_class_id: input.classId,
    p_message: trimmed,
  });

  if (error) {
    console.warn("[meetingPlan] post_class_message failed", error.message);
    return { ok: false as const, error };
  }

  return { ok: true as const };
}

export async function buildSetMeetingPlanMessage(
  deviceId: string,
  scheduledAtIso: string,
  isUpdate: boolean
) {
  const name = await loadDisplayName(deviceId);
  const when = formatMeetingPlanJst(scheduledAtIso);
  const verb = isUpdate ? "変更" : "設定";
  return `${name}さんが次の集合時間を ${when} に${verb}しました`;
}

export async function buildCancelMeetingPlanMessage() {
  return "次の集合時間がキャンセルされました";
}
