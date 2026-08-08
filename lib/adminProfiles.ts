import {
  computeProfileAge,
  isUserProfileComplete,
  type UserProfileFields,
} from "@/lib/profileClient";

export type AdminProfileRow = UserProfileFields & {
  user_id?: string | null;
  created_at?: string | null;
};

export type AdminProfileRecentItem = {
  display_name: string;
  created_at: string;
  age: number | null;
  gender: "male" | "female";
  gender_label: string;
  user_id: string | null;
  device_id: string;
};

export function profileGenderLabel(gender: string | null | undefined): string {
  const value = String(gender ?? "").trim();
  if (value === "male") return "男性";
  if (value === "female") return "女性";
  return value || "-";
}

/** Same completion meaning as isUserProfileComplete. */
export function isCompleteAdminProfile(
  row: AdminProfileRow | null | undefined
): boolean {
  return isUserProfileComplete(row);
}

export function isCreatedInRange(
  createdAt: string | null | undefined,
  startIso: string,
  endIso: string
): boolean {
  const value = String(createdAt ?? "").trim();
  if (!value) return false;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return false;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return t >= start && t <= end;
}

export function countCompleteProfiles(rows: AdminProfileRow[]): number {
  return rows.filter((row) => isCompleteAdminProfile(row)).length;
}

export function countCompleteProfilesCreatedToday(
  rows: AdminProfileRow[],
  startIso: string,
  endIso: string
): number {
  return rows.filter(
    (row) =>
      isCompleteAdminProfile(row) &&
      isCreatedInRange(row.created_at, startIso, endIso)
  ).length;
}

export function toAdminProfileRecentItem(
  row: AdminProfileRow
): AdminProfileRecentItem | null {
  if (!isCompleteAdminProfile(row)) return null;
  const deviceId = String(row.device_id ?? "").trim();
  const displayName = String(row.display_name ?? "").trim();
  const createdAt = String(row.created_at ?? "").trim();
  const gender = String(row.gender ?? "").trim() as "male" | "female";
  if (!deviceId || !displayName || !createdAt) return null;

  return {
    display_name: displayName,
    created_at: createdAt,
    age: computeProfileAge(row.birth_date),
    gender,
    gender_label: profileGenderLabel(gender),
    user_id: String(row.user_id ?? "").trim() || null,
    device_id: deviceId,
  };
}

export function buildAdminProfilesRecent(
  rows: AdminProfileRow[],
  limit: number
): AdminProfileRecentItem[] {
  const items = rows
    .map((row) => toAdminProfileRecentItem(row))
    .filter((row): row is AdminProfileRecentItem => Boolean(row));

  items.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return items.slice(0, Math.max(0, limit));
}
