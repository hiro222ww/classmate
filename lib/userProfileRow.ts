/** Mirrors public.user_profiles columns used by the app. */
export type UserProfileRow = {
  device_id: string;
  user_id?: string | null;
  display_name: string | null;
  birth_date: string | null;
  gender: string | null;
  photo_path: string | null;
  hobbies: string | null;
  bio: string | null;
  show_age: boolean;
  terms_agreed_at?: string | null;
  privacy_agreed_at?: string | null;
  guidelines_agreed_at?: string | null;
  legal_consent_version?: string | null;
  terms_version?: string | null;
};

export const USER_PROFILE_BASE_SELECT =
  "device_id, display_name, birth_date, gender, photo_path, hobbies, bio, show_age, user_id";

export const USER_PROFILE_LEGAL_SELECT =
  `${USER_PROFILE_BASE_SELECT}, terms_agreed_at, privacy_agreed_at, guidelines_agreed_at, legal_consent_version, terms_version`;

export const USER_PROFILE_LEGAL_CONSENT_SELECT =
  "photo_path, show_age, terms_agreed_at, privacy_agreed_at, guidelines_agreed_at, legal_consent_version, terms_version, user_id";

export function isMissingProfileColumnError(message: string) {
  const normalized = String(message ?? "").toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("column") && normalized.includes("user_profiles")
  );
}
