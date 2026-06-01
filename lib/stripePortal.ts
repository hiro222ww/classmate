import { stripe } from "@/lib/stripe";
import type { BillingCategory } from "@/lib/billingCatalog";
import { findActiveSubscriptionItem } from "@/lib/billingSubscriptions";

export type PortalAction = "manage" | "cancel";

function portalMaintenanceConfigurationId() {
  return (
    String(process.env.STRIPE_PORTAL_CONFIG_MAINTENANCE ?? "").trim() ||
    String(process.env.STRIPE_PORTAL_CONFIG_SLOTS ?? "").trim() ||
    String(process.env.STRIPE_PORTAL_CONFIG_THEME ?? "").trim()
  );
}

export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
  category: BillingCategory;
  action: PortalAction;
}) {
  if (params.action === "manage") {
    const configuration = portalMaintenanceConfigurationId();

    if (!configuration) {
      return {
        ok: false as const,
        error: "portal_configuration_missing:maintenance",
      };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
      configuration,
    });

    return { ok: true as const, url: session.url };
  }

  const existing = await findActiveSubscriptionItem({
    customerId: params.customerId,
    category: params.category,
  });

  if (!existing) {
    return {
      ok: false as const,
      error: `subscription_not_found:${params.category}`,
    };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: {
        subscription: existing.subscription.id,
      },
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: params.returnUrl,
        },
      },
    },
  });

  return { ok: true as const, url: session.url };
}
