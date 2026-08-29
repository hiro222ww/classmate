import { getAgeFromBirthDate } from "@/lib/age";

export type UserProfileFields = {
  device_id?: string | null;
  display_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  declared_age?: number | null;
  declared_age_as_of?: string | null;
  photo_path?: string | null;
  hobbies?: string | null;
  bio?: string | null;
  show_age?: boolean | null;
};

export const PROFILE_UNSET_LABEL = "未設定";

export const DECLARED_AGE_MIN = 18;
export const DECLARED_AGE_MAX = 120;

export function isValidProfileGender(
  gender: unknown
): gender is "male" | "female" {
  const value = String(gender ?? "").trim();
  return value === "male" || value === "female";
}

export function normalizeDeclaredAge(age: unknown): number | null {
  if (typeof age === "string" && age.trim() !== "") {
    const parsed = Number(age);
    if (!Number.isFinite(parsed)) return null;
    return normalizeDeclaredAge(parsed);
  }
  if (typeof age !== "number" || !Number.isFinite(age)) return null;
  const n = Math.floor(age);
  if (n < 0 || n > DECLARED_AGE_MAX) return null;
  return n;
}

/** Calendar years elapsed since as_of (date-only), floored at 0. */
export function yearsSinceAsOf(
  asOf: string | null | undefined,
  now = new Date()
): number {
  const raw = String(asOf ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 0;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!y || !m || !d) return 0;
  let years = now.getFullYear() - y;
  const month = now.getMonth() + 1;
  const day = now.getDate();
  if (month < m || (month === m && day < d)) years -= 1;
  return Math.max(0, years);
}

export function computeDeclaredAgeEffective(
  declaredAge: number | null | undefined,
  declaredAgeAsOf: string | null | undefined,
  now = new Date()
): number | null {
  const base = normalizeDeclaredAge(declaredAge);
  if (base == null) return null;
  return base + yearsSinceAsOf(declaredAgeAsOf, now);
}

/**
 * Effective age for matching / gates.
 * Prefer birth_date; otherwise declared_age advanced by as_of.
 */
export function resolveEffectiveProfileAge(
  profile: UserProfileFields | null | undefined,
  now = new Date()
): number | null {
  if (!profile) return null;
  const fromBirth = getAgeFromBirthDate(profile.birth_date, now);
  if (fromBirth != null) return fromBirth;
  return computeDeclaredAgeEffective(
    profile.declared_age,
    profile.declared_age_as_of,
    now
  );
}

/** Detailed profile: display_name + birth_date + gender (unchanged). */
export function isUserProfileComplete(
  profile: UserProfileFields | null | undefined
): boolean {
  if (!profile) return false;

  const deviceId = String(profile.device_id ?? "").trim();
  const displayName = String(profile.display_name ?? "").trim();
  const birthDate = String(profile.birth_date ?? "").trim();
  const gender = String(profile.gender ?? "").trim();

  return Boolean(
    deviceId &&
      displayName &&
      /^\d{4}-\d{2}-\d{2}$/.test(birthDate) &&
      isValidProfileGender(gender)
  );
}

/** Minimum profile for random call: display_name + effective age. */
export function hasMinimumProfile(
  profile: UserProfileFields | null | undefined,
  opts?: { minAge?: number; now?: Date }
): boolean {
  if (!profile) return false;
  const deviceId = String(profile.device_id ?? "").trim();
  const displayName = String(profile.display_name ?? "").trim();
  if (!deviceId || !displayName) return false;
  const age = resolveEffectiveProfileAge(profile, opts?.now);
  if (age == null) return false;
  const minAge = opts?.minAge ?? DECLARED_AGE_MIN;
  return age >= minAge;
}

export function computeProfileAge(
  birthDate: string | null | undefined
): number | null {
  return getAgeFromBirthDate(birthDate);
}

export function normalizeProfileAge(age: unknown): number | null {
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0) {
    return null;
  }
  return Math.floor(age);
}

export function resolveProfileDisplayAge(
  profile: UserProfileFields | null | undefined,
  explicitAge?: number | null
): number | null {
  const fromApi = normalizeProfileAge(explicitAge);
  if (fromApi != null) return fromApi;

  return normalizeProfileAge(resolveEffectiveProfileAge(profile));
}

export const resolvePublicProfileAge = resolveProfileDisplayAge;

export function formatProfileAgeLabel(age: number | null | undefined): string {
  if (age != null && Number.isFinite(age)) {
    return `${Math.floor(age)}歳`;
  }
  return PROFILE_UNSET_LABEL;
}

export function formatGenderLabel(gender?: string | null) {
  const value = String(gender ?? "").trim().toLowerCase();
  if (value === "male") return "男性";
  if (value === "female") return "女性";
  return null;
}

export function formatProfileGenderLabel(
  gender: string | null | undefined,
  profileComplete = true
): string {
  if (!profileComplete) return PROFILE_UNSET_LABEL;
  return formatGenderLabel(gender) ?? PROFILE_UNSET_LABEL;
}

export function formatOptionalProfileText(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || PROFILE_UNSET_LABEL;
}

export function formatProfileNicknameLabel(
  displayName: string | null | undefined,
  profileComplete = true
): string {
  const trimmed = String(displayName ?? "").trim();
  if (!trimmed) return PROFILE_UNSET_LABEL;
  if (!profileComplete) return PROFILE_UNSET_LABEL;
  return trimmed;
}
