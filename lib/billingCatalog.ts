import type Stripe from "stripe";

/** ベータ期間中、テーマ加入者全員に付与する topic_plan（機能面は同一） */
export const UNIFIED_TOPIC_ENTITLEMENT = 400;

export type BillingCategory = "slots" | "topic_plan";

export type SellableSlotsTotal = 3 | 5;
export type SellableTopicAmount = 400 | 800 | 1200;

const SELLABLE_SLOTS: SellableSlotsTotal[] = [3, 5];
const SELLABLE_TOPIC_AMOUNTS: SellableTopicAmount[] = [400, 800, 1200];

function mustEnv(name: string) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

function envPrice(name: string) {
  return String(process.env[name] ?? "").trim();
}

export function getAllKnownPriceIds() {
  return {
    slots3: envPrice("STRIPE_PRICE_SLOTS_3"),
    slots5: envPrice("STRIPE_PRICE_SLOTS_5"),
    topic400: envPrice("STRIPE_PRICE_TOPIC_400"),
    topic800: envPrice("STRIPE_PRICE_TOPIC_800"),
    topic1200: envPrice("STRIPE_PRICE_TOPIC_1200"),
  };
}

export function isSellableSlotsTotal(value: unknown): value is SellableSlotsTotal {
  return value === 3 || value === 5;
}

export function isSellableTopicAmount(value: unknown): value is SellableTopicAmount {
  return value === 400 || value === 800 || value === 1200;
}

export function priceIdForSlotsTotal(slotsTotal: SellableSlotsTotal) {
  if (slotsTotal === 3) return mustEnv("STRIPE_PRICE_SLOTS_3");
  return mustEnv("STRIPE_PRICE_SLOTS_5");
}

export function priceIdForTopicAmount(amount: SellableTopicAmount) {
  if (amount === 400) return mustEnv("STRIPE_PRICE_TOPIC_400");
  if (amount === 800) return mustEnv("STRIPE_PRICE_TOPIC_800");
  return mustEnv("STRIPE_PRICE_TOPIC_1200");
}

/** Stripe Price ID → billing category（slots / topic_plan）。混在防止用。 */
export function categoryForPriceId(priceId: string): BillingCategory | null {
  const ids = getAllKnownPriceIds();
  if (!priceId) return null;

  if (priceId === ids.slots3 || priceId === ids.slots5) return "slots";
  if (
    priceId === ids.topic400 ||
    priceId === ids.topic800 ||
    priceId === ids.topic1200
  ) {
    return "topic_plan";
  }

  return null;
}

export function isKnownPriceId(priceId: string) {
  return categoryForPriceId(priceId) !== null;
}

export function isSellablePriceId(priceId: string) {
  const category = categoryForPriceId(priceId);
  if (!category) return false;

  if (category === "slots") {
    const ids = getAllKnownPriceIds();
    return priceId === ids.slots3 || priceId === ids.slots5;
  }

  return isSellableTopicAmount(rankForPriceId(priceId, "topic_plan"));
}

export function assertPriceIdMatchesCategory(
  priceId: string,
  category: BillingCategory
) {
  const actual = categoryForPriceId(priceId);
  if (!actual) {
    throw new Error("unknown_price_id");
  }
  if (actual !== category) {
    throw new Error("price_category_mismatch");
  }
}

export function rankForPriceId(priceId: string, category: BillingCategory) {
  const ids = getAllKnownPriceIds();

  if (category === "slots") {
    if (priceId === ids.slots3) return 3;
    if (priceId === ids.slots5) return 5;
    return 0;
  }

  if (priceId === ids.topic400) return 400;
  if (priceId === ids.topic800) return 800;
  if (priceId === ids.topic1200) return 1200;
  return 0;
}

export function topicSupportRankFromPlan(plan: string | null | undefined) {
  const value = String(plan ?? "").trim();
  if (value === "topic_support_1200") return 1200;
  if (value === "topic_support_800") return 800;
  if (value === "topic_support_400") return 400;
  if (value === "topic_1200") return 1200;
  if (value === "topic_800") return 800;
  if (value === "topic_400") return 400;
  return 0;
}

export type BillingCategoryMismatch = {
  subscriptionId: string;
  priceId: string;
  expectedCategory: BillingCategory;
  actualCategory: BillingCategory;
};

function expectedCategoryFromSubscriptionMetadata(
  sub: Stripe.Subscription
): BillingCategory | null {
  const kind = String(sub.metadata?.kind ?? "").trim();
  if (kind === "slots") return "slots";
  if (kind === "topic_plan") return "topic_plan";
  return null;
}

export function computeEntitlementsFromSubscriptions(
  subs: Stripe.Subscription[],
  options?: { ignoreUnknownPriceIds?: boolean }
) {
  const ignoreUnknown = options?.ignoreUnknownPriceIds !== false;
  let class_slots = 1;
  let topic_plan = 0;
  let paidTopicSupportRank = 0;
  const unknownPriceIds: string[] = [];
  const categoryMismatches: BillingCategoryMismatch[] = [];

  for (const sub of subs) {
    if (sub.status !== "active" && sub.status !== "trialing") continue;

    for (const item of sub.items.data) {
      const priceId = String(item.price?.id ?? "").trim();
      if (!priceId) continue;

      if (!isKnownPriceId(priceId)) {
        unknownPriceIds.push(priceId);
        continue;
      }

      const category = categoryForPriceId(priceId);
      if (!category) continue;

      const expectedCategory = expectedCategoryFromSubscriptionMetadata(sub);
      if (expectedCategory && expectedCategory !== category) {
        categoryMismatches.push({
          subscriptionId: sub.id,
          priceId,
          expectedCategory,
          actualCategory: category,
        });
        console.warn("[billingCatalog] category mismatch; skipping entitlement", {
          subscriptionId: sub.id,
          priceId,
          expectedCategory,
          actualCategory: category,
        });
        continue;
      }

      const rank = rankForPriceId(priceId, category);
      if (category === "slots") {
        class_slots = Math.max(class_slots, rank);
      } else if (rank > 0) {
        paidTopicSupportRank = Math.max(paidTopicSupportRank, rank);
      }
    }
  }

  if (paidTopicSupportRank > 0) {
    topic_plan = UNIFIED_TOPIC_ENTITLEMENT;
  }

  if (unknownPriceIds.length > 0 && !ignoreUnknown) {
    console.warn("[billingCatalog] ignored unknown priceIds", {
      unknownPriceIds,
    });
  }

  if (categoryMismatches.length > 0) {
    console.warn("[billingCatalog] category mismatches detected during sync", {
      categoryMismatches,
    });
  }

  const plan = resolvePlanLabel({
    class_slots,
    topic_plan,
    paidTopicSupportRank,
  });
  const can_create_classes = class_slots > 1 || topic_plan > 0;
  const theme_pass = topic_plan > 0;

  return {
    class_slots,
    topic_plan,
    paidTopicSupportRank,
    plan,
    can_create_classes,
    theme_pass,
    unknownPriceIds,
    categoryMismatches,
  };
}

export function resolvePlanLabel(params: {
  class_slots: number;
  topic_plan: number;
  paidTopicSupportRank?: number;
}) {
  const { class_slots, topic_plan } = params;
  const paidTopicSupportRank = Number(params.paidTopicSupportRank ?? 0);

  if (topic_plan > 0 && paidTopicSupportRank >= 1200) {
    return "topic_support_1200";
  }
  if (topic_plan > 0 && paidTopicSupportRank >= 800) {
    return "topic_support_800";
  }
  if (topic_plan > 0) {
    return "topic_support_400";
  }

  if (class_slots >= 5) return "slots_5";
  if (class_slots >= 3) return "slots_3";
  return "free";
}

export function assertSellableCheckoutBody(body: {
  kind?: unknown;
  slotsTotal?: unknown;
  amount?: unknown;
}) {
  if (body.kind === "slots") {
    if (!isSellableSlotsTotal(body.slotsTotal)) {
      throw new Error("invalid_or_unsellable_slotsTotal");
    }
    const priceId = priceIdForSlotsTotal(body.slotsTotal);
    assertPriceIdMatchesCategory(priceId, "slots");
    return {
      category: "slots" as const,
      targetRank: body.slotsTotal,
      priceId,
    };
  }

  if (body.kind === "topic_plan") {
    if (!isSellableTopicAmount(body.amount)) {
      throw new Error("invalid_or_unsellable_topic_plan");
    }
    const priceId = priceIdForTopicAmount(body.amount);
    assertPriceIdMatchesCategory(priceId, "topic_plan");
    return {
      category: "topic_plan" as const,
      targetRank: body.amount,
      priceId,
    };
  }

  throw new Error("invalid_request_body");
}

export { SELLABLE_SLOTS, SELLABLE_TOPIC_AMOUNTS };
