export type GenderRestriction = "male" | "female" | null;

export function normalizeGenderRestriction(v: unknown): GenderRestriction {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();

  if (s === "male" || s === "female") {
    return s;
  }

  return null;
}

export function genderRestrictionBlocksJoin(params: {
  genderRestriction: unknown;
  profileGender: unknown;
}) {
  const restriction = normalizeGenderRestriction(params.genderRestriction);
  if (!restriction) return false;

  const profileGender = String(params.profileGender ?? "")
    .trim()
    .toLowerCase();

  return profileGender !== restriction;
}

export const GENDER_RESTRICTED_TOPIC_MESSAGE =
  "このテーマには参加できません";
