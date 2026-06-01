import { getAgeFromBirthDate } from "@/lib/age";

export type UserProfileFields = {
  device_id?: string | null;
  display_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  photo_path?: string | null;
  hobbies?: string | null;
  bio?: string | null;
};

export const PROFILE_UNSET_LABEL = "未設定";

export function isValidProfileGender(
  gender: unknown
): gender is "male" | "female" {
  const value = String(gender ?? "").trim();
  return value === "male" || value === "female";
}

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

export function computeProfileAge(
  birthDate: string | null | undefined
): number | null {
  return getAgeFromBirthDate(birthDate);
}

export function resolveProfileDisplayAge(
  profile: UserProfileFields | null | undefined,
  explicitAge?: number | null
): number | null {
  if (!isUserProfileComplete(profile)) return null;

  const rawAge =
    typeof explicitAge === "number" && Number.isFinite(explicitAge)
      ? explicitAge
      : computeProfileAge(profile?.birth_date);

  if (rawAge == null || !Number.isFinite(rawAge) || rawAge < 0) return null;
  return Math.floor(rawAge);
}

export const resolvePublicProfileAge = resolveProfileDisplayAge;

export function formatProfileAgeLabel(age: number | null | undefined): string {
  if (age == null || !Number.isFinite(age)) return PROFILE_UNSET_LABEL;
  return `${Math.floor(age)}歳`;
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
