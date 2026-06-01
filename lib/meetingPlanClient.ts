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
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, y, mo, d, h, mi] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}
