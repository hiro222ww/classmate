import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveDisplayName } from "@/lib/resolveDisplayName";

const JST = "Asia/Tokyo";

export type MeetingPlanRow = {
  id: string;
  class_id: string;
  scheduled_at: string;
  note?: string | null;
  created_by_device_id: string;
  created_at: string;
  canceled_at?: string | null;
};

export type MeetingPlanPublic = {
  id: string;
  class_id: string;
  scheduled_at: string;
  note?: string | null;
  created_by_device_id: string;
  created_at: string;
  is_past: boolean;
  display_label: string;
};

export function normalizeMeetingDeviceId(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeMeetingClassId(value: unknown) {
  return String(value ?? "").trim();
}

function getJstParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
  };
}

function formatJstTime(date: Date) {
  const { hour, minute } = getJstParts(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isSameJstDay(a: Date, b: Date) {
  const pa = getJstParts(a);
  const pb = getJstParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

export function isMeetingPlanPast(scheduledAt: string | Date, now = new Date()) {
  const t = new Date(scheduledAt).getTime();
  if (!Number.isFinite(t)) return true;
  return t <= now.getTime();
}

export function formatMeetingPlanJst(scheduledAt: string | Date) {
  const date = new Date(scheduledAt);
  if (!Number.isFinite(date.getTime())) return "";

  const now = new Date();
  const timeLabel = formatJstTime(date);

  if (isSameJstDay(date, now)) {
    return `今日 ${timeLabel}`;
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (isSameJstDay(date, tomorrow)) {
    return `明日 ${timeLabel}`;
  }

  const { month, day } = getJstParts(date);
  const weekdayJa = new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST,
    weekday: "short",
  })
    .format(date)
    .replace(/曜日?$/, "");

  return `${month}/${day}(${weekdayJa}) ${timeLabel}`;
}

export function toMeetingPlanPublic(row: MeetingPlanRow): MeetingPlanPublic {
  const isPast = isMeetingPlanPast(row.scheduled_at);
  return {
    id: row.id,
    class_id: row.class_id,
    scheduled_at: row.scheduled_at,
    note: row.note ?? null,
    created_by_device_id: row.created_by_device_id,
    created_at: row.created_at,
    is_past: isPast,
    display_label: isPast ? "終了済み" : formatMeetingPlanJst(row.scheduled_at),
  };
}

export function isoToJstDatetimeLocalInput(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";

  const { year, month, day, hour, minute } = getJstParts(date);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function jstDatetimeLocalInputToIso(localValue: string) {
  const trimmed = String(localValue ?? "").trim();
  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );
  if (!match) return null;

  const [, y, mo, d, h, mi] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

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
