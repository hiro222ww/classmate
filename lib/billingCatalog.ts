import type Stripe from "stripe";
import { BETA_AVAILABLE_TOPIC_PLAN } from "@/lib/planTiers";

export type BillingCategory = "slots" | "topic_plan";

export type SellableSlotsTotal = 3 | 5;
export type SellableTopicAmount = typeof BETA_AVAILABLE_TOPIC_PLAN;

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

const SELLABLE_SLOTS: SellableSlotsTotal[] = [3, 5];
const SELLABLE_TOPIC_AMOUNTS: SellableTopicAmount[] = [BETA_AVAILABLE_TOPIC_PLAN];

export function isSellableSlotsTotal(value: unknown): value is SellableSlotsTotal {
  return value === 3 || value === 5;
}

export function isSellableTopicAmount(value: unknown): value is SellableTopicAmount {
  return Number(value) === BETA_AVAILABLE_TOPIC_PLAN;
}

export function priceIdForSlotsTotal(slotsTotal: SellableSlotsTotal) {
  if (slotsTotal === 3) return mustEnv("STRIPE_PRICE_SLOTS_3");
  return mustEnv("STRIPE_PRICE_SLOTS_5");
}

export function priceIdForTopicAmount(amount: SellableTopicAmount) {
  if (amount === 400) return mustEnv("STRIPE_PRICE_TOPIC_400");
  throw new Error("topic_plan_not_sellable");
}

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
  const ids = getAllKnownPriceIds();
  return (
    priceId === ids.slots3 ||
    priceId === ids.slots5 ||
    priceId === ids.topic400
  );
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

export function computeEntitlementsFromSubscriptions(
  subs: Stripe.Subscription[],
  options?: { ignoreUnknownPriceIds?: boolean }
) {
  const ignoreUnknown = options?.ignoreUnknownPriceIds !== false;
  let class_slots = 1;
  let topic_plan = 0;
  const unknownPriceIds: string[] = [];

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

      const rank = rankForPriceId(priceId, category);
      if (category === "slots") {
        class_slots = Math.max(class_slots, rank);
      } else {
        topic_plan = Math.max(topic_plan, rank);
      }
    }
  }

  if (unknownPriceIds.length > 0 && !ignoreUnknown) {
    console.warn("[billingCatalog] ignored unknown priceIds", {
      unknownPriceIds,
    });
  }

  const plan = resolvePlanLabel({ class_slots, topic_plan });
  const can_create_classes = class_slots > 1 || topic_plan > 0;
  const theme_pass = topic_plan > 0;

  return {
    class_slots,
    topic_plan,
    plan,
    can_create_classes,
    theme_pass,
    unknownPriceIds,
  };
}

export function resolvePlanLabel(params: {
  class_slots: number;
  topic_plan: number;
}) {
  const { class_slots, topic_plan } = params;

  if (topic_plan >= 1200) return "topic_1200";
  if (topic_plan >= 800) return "topic_800";
  if (topic_plan >= 400) return "topic_400";
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
    return {
      category: "slots" as const,
      targetRank: body.slotsTotal,
      priceId: priceIdForSlotsTotal(body.slotsTotal),
    };
  }

  if (body.kind === "topic_plan") {
    if (!isSellableTopicAmount(body.amount)) {
      throw new Error("invalid_or_unsellable_topic_plan");
    }
    return {
      category: "topic_plan" as const,
      targetRank: body.amount,
      priceId: priceIdForTopicAmount(body.amount),
    };
  }

  throw new Error("invalid_request_body");
}

export { SELLABLE_SLOTS, SELLABLE_TOPIC_AMOUNTS };
