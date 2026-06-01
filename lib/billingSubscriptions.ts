import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import {
  assertPriceIdMatchesCategory,
  type BillingCategory,
  isSellableTopicAmount,
  rankForPriceId,
} from "@/lib/billingCatalog";

export type ActiveSubscriptionItem = {
  subscription: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
  priceId: string;
  rank: number;
};

export async function listActiveSubscriptions(customerId: string) {
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  });

  return subs.data.filter(
    (sub) => sub.status === "active" || sub.status === "trialing"
  );
}

export async function findActiveSubscriptionItem(params: {
  customerId: string;
  category: BillingCategory;
}): Promise<ActiveSubscriptionItem | null> {
  const activeSubs = await listActiveSubscriptions(params.customerId);

  let best: ActiveSubscriptionItem | null = null;

  for (const subscription of activeSubs) {
    for (const item of subscription.items.data) {
      const priceId = String(item.price?.id ?? "").trim();
      if (!priceId) continue;

      const rank = rankForPriceId(priceId, params.category);
      if (rank <= 0) continue;

      if (!best || rank > best.rank) {
        best = { subscription, item, priceId, rank };
      }
    }
  }

  return best;
}

export async function updateSubscriptionItemPrice(params: {
  customerId: string;
  category: BillingCategory;
  nextPriceId: string;
  nextRank: number;
}) {
  try {
    assertPriceIdMatchesCategory(params.nextPriceId, params.category);
  } catch (error) {
    const message = error instanceof Error ? error.message : "price_category_mismatch";
    return { ok: false as const, error: message };
  }

  const existing = await findActiveSubscriptionItem({
    customerId: params.customerId,
    category: params.category,
  });

  if (!existing) {
    return { ok: false as const, error: "subscription_not_found" };
  }

  if (existing.priceId === params.nextPriceId) {
    return { ok: false as const, error: "same_plan_not_allowed" };
  }

  if (params.category === "slots" && params.nextRank <= existing.rank) {
    return { ok: false as const, error: "downgrade_or_same_plan_not_allowed" };
  }

  if (
    params.category === "topic_plan" &&
    !isSellableTopicAmount(params.nextRank)
  ) {
    return { ok: false as const, error: "invalid_or_unsellable_topic_plan" };
  }

  const updated = await stripe.subscriptions.update(existing.subscription.id, {
    items: [
      {
        id: existing.item.id,
        price: params.nextPriceId,
      },
    ],
    proration_behavior: "create_prorations",
    metadata: {
      ...(existing.subscription.metadata ?? {}),
      kind: params.category === "slots" ? "slots" : "topic_plan",
    },
  });

  return { ok: true as const, subscription: updated };
}
