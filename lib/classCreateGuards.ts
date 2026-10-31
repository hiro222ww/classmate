import { ADULT_AGE_THRESHOLD } from "@/lib/agePolicyRules";

/** Public create UI: Classmate is 18+. */
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

/**
 * UI helper for create CTAs / create page gates.
 * Prefers server-provided can_create_classes when present.
 */
export function hasCreateClassEntitlement(
  ent: CreateEntitlementsLike | null | undefined
): boolean {
  if (!ent) return false;
  if (typeof ent.can_create_classes === "boolean") {
    return ent.can_create_classes;
  }
  return deriveCanCreateClasses(ent);
}
