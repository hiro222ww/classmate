import { stripe } from "@/lib/stripe";
import type { BillingCategory } from "@/lib/billingCatalog";
import { findActiveSubscriptionItem } from "@/lib/billingSubscriptions";

export type PortalAction = "manage" | "cancel";

const validatedConfigCache = new Map<
  string,
  { ok: true; id: string } | { ok: false; error: string }
>();

function readMaintenancePortalConfigurationId() {
  return String(process.env.STRIPE_PORTAL_CONFIG_MAINTENANCE ?? "").trim();
}

function warnIfDeprecatedPortalEnvVars() {
  const slots = String(process.env.STRIPE_PORTAL_CONFIG_SLOTS ?? "").trim();
  const theme = String(process.env.STRIPE_PORTAL_CONFIG_THEME ?? "").trim();

  if (slots || theme) {
    console.warn(
      "[stripePortal] STRIPE_PORTAL_CONFIG_SLOTS/THEME are deprecated and ignored. Use STRIPE_PORTAL_CONFIG_MAINTENANCE only.",
      {
        hasSlotsConfig: Boolean(slots),
        hasThemeConfig: Boolean(theme),
      }
    );
  }
}

async function requireValidatedMaintenancePortalConfiguration() {
  warnIfDeprecatedPortalEnvVars();

  const configurationId = readMaintenancePortalConfigurationId();
  if (!configurationId) {
    return {
      ok: false as const,
      error: "portal_configuration_missing:STRIPE_PORTAL_CONFIG_MAINTENANCE",
    };
  }

  const cached = validatedConfigCache.get(configurationId);
  if (cached) return cached;

  try {
    const config =
      await stripe.billingPortal.configurations.retrieve(configurationId);

    if (config.features?.subscription_update?.enabled) {
      const result = {
        ok: false as const,
        error: "portal_configuration_invalid:subscription_update_enabled",
      };
      validatedConfigCache.set(configurationId, result);
      return result;
    }

    const result = { ok: true as const, id: configurationId };
    validatedConfigCache.set(configurationId, result);
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "portal_configuration_lookup_failed";

    const result = {
      ok: false as const,
      error: `portal_configuration_invalid:${message}`,
    };
    validatedConfigCache.set(configurationId, result);
    return result;
  }
}

export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
  category: BillingCategory;
  action: PortalAction;
}) {
  const configRes = await requireValidatedMaintenancePortalConfiguration();
  if (!configRes.ok) {
    return configRes;
  }

  const configuration = configRes.id;

  if (params.action === "manage") {
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
      configuration,
    });

    console.log("[stripePortal] manage session", {
      configuration,
      customerId: params.customerId,
    });

    return { ok: true as const, url: session.url, configuration };
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
    configuration,
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

  console.log("[stripePortal] cancel session", {
    configuration,
    customerId: params.customerId,
    category: params.category,
    subscriptionId: existing.subscription.id,
  });

  return { ok: true as const, url: session.url, configuration };
}
