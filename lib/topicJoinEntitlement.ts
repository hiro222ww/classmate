import { UNIFIED_TOPIC_ENTITLEMENT } from "@/lib/billingCatalog";

export type TopicJoinEntitlementInput = {
  /** When theme billing is off, paid-priced topics are joinable (existing product rule). */
  themeBillingEnabled: boolean;
  monthlyPrice: number;
  topicPlan: number;
  themePass?: boolean;
};

/**
 * Resolve effective topic_plan amount for join checks.
 * Mirrors SelectClient: prefer topic_plan; legacy theme_pass-only → 1200.
 */
export function resolveEffectiveTopicPlan(params: {
  topic_plan?: number | null;
  theme_pass?: boolean | null;
}): number {
  const plan = Number(params.topic_plan ?? 0);
  if (Number.isFinite(plan) && plan > 0) return plan;
  if (params.theme_pass) return 1200;
  return 0;
}

/**
 * Shared FE/API rule for joining a topic board by price.
 * - Free boards (monthlyPrice <= 0): always allowed
 * - theme_billing_enabled=false: allowed (公開中テーマは無料利用)
 * - theme_billing_enabled=true: require monthlyPrice <= effective topic_plan
 */
export function canJoinTopicByEntitlement(
  input: TopicJoinEntitlementInput
): boolean {
  const price = Math.max(0, Number(input.monthlyPrice ?? 0) || 0);
  if (price <= 0) return true;
  if (!input.themeBillingEnabled) return true;
  const plan = resolveEffectiveTopicPlan({
    topic_plan: input.topicPlan,
    theme_pass: input.themePass,
  });
  return price <= plan;
}

export function topicJoinDeniedMessage(monthlyPrice: number): string {
  const price = Math.max(0, Math.floor(Number(monthlyPrice) || 0));
  return `このテーマは課金プラン（¥${price}/月相当）以上が必要です。`;
}

/** Minimum entitlement amount that unlocks a topic at the given price under unified beta rules. */
export function minimumTopicPlanForPrice(monthlyPrice: number): number {
  const price = Math.max(0, Number(monthlyPrice) || 0);
  if (price <= 0) return 0;
  // Beta collapses paid topic subs to UNIFIED_TOPIC_ENTITLEMENT (400).
  // Prices above that remain locked for all subscribers until catalog changes.
  return Math.max(price, UNIFIED_TOPIC_ENTITLEMENT) === UNIFIED_TOPIC_ENTITLEMENT
    ? UNIFIED_TOPIC_ENTITLEMENT
    : price;
}
