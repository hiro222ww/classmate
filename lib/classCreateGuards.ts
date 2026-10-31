import { ADULT_AGE_THRESHOLD } from "@/lib/agePolicyRules";

export const CLASS_CREATE_MIN_AGE = ADULT_AGE_THRESHOLD; // 18

export type CreateEntitlementsLike = {
  can_create_classes?: boolean | null;
  class_slots?: number | null;
  topic_plan?: number | null;
};

/** Existing billing formula — keep in sync with billingCatalog. */
export function deriveCanCreateClasses(params: {
  class_slots?: number | null;
  topic_plan?: number | null;
}): boolean {
  const slots = Number(params.class_slots ?? 1);
  const topicPlan = Number(params.topic_plan ?? 0);
  return slots > 1 || topicPlan > 0;
}

export function hasCreateClassEntitlement(
  ent: CreateEntitlementsLike | null | undefined
): boolean {
  if (!ent) return false;
  if (typeof ent.can_create_classes === "boolean") {
    return ent.can_create_classes;
  }
  return deriveCanCreateClasses(ent);
}

export function normalizeCreateMinAge(
  raw: unknown
): { ok: true; minAge: number } | { ok: false; error: string; message: string } {
  const n = Number(raw ?? CLASS_CREATE_MIN_AGE);
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      error: "invalid_min_age",
      message: `最低年齢は${CLASS_CREATE_MIN_AGE}以上で指定してください。`,
    };
  }
  const minAge = Math.floor(n);
  if (minAge < CLASS_CREATE_MIN_AGE) {
    return {
      ok: false,
      error: "min_age_too_low",
      message: `Classmateは${CLASS_CREATE_MIN_AGE}歳以上向けです。最低年齢は${CLASS_CREATE_MIN_AGE}以上にしてください。`,
    };
  }
  return { ok: true, minAge };
}

/**
 * Public create APIs: only false is accepted for sensitive/premium.
 * Admin topic/world editors use separate admin routes.
 */
export function assertPublicCreateFlags(body?: {
  isSensitive?: unknown;
  isPremium?: unknown;
}):
  | { ok: true; isSensitive: false; isPremium: false }
  | { ok: false; error: string; message: string } {
  if (body?.isSensitive === true || body?.isSensitive === "true") {
    return {
      ok: false,
      error: "sensitive_flag_forbidden",
      message: "センシティブ属性は一般ユーザーが設定できません。",
    };
  }
  if (body?.isPremium === true || body?.isPremium === "true") {
    return {
      ok: false,
      error: "premium_flag_forbidden",
      message: "プレミアム属性は一般ユーザーが設定できません。",
    };
  }
  return { ok: true, isSensitive: false, isPremium: false };
}
