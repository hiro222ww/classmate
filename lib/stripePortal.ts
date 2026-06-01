import { stripe } from "@/lib/stripe";
import type { BillingCategory } from "@/lib/billingCatalog";
import { findActiveSubscriptionItem } from "@/lib/billingSubscriptions";

/**
 * Portal plan updates are opened via flow_data.subscription_update with the
 * subscription ID for that billing category. Configurations limit target prices
 * (THEME → topic prices only, SLOTS → slot prices only). General portal home
 * is not used for updates.
 */
export type PortalAction =
  | "manage"
  | "cancel"
  | "update_theme"
  | "update_slots";

type PortalConfigKind = "maintenance" | "theme" | "slots";

const validatedConfigCache = new Map<
  string,
  { ok: true; id: string } | { ok: false; error: string }
>();

function readPortalConfigurationId(kind: PortalConfigKind) {
  switch (kind) {
    case "maintenance":
      return String(process.env.STRIPE_PORTAL_CONFIG_MAINTENANCE ?? "").trim();
    case "theme":
      return String(process.env.STRIPE_PORTAL_CONFIG_THEME ?? "").trim();
    case "slots":
      return String(process.env.STRIPE_PORTAL_CONFIG_SLOTS ?? "").trim();
  }
}

function configEnvName(kind: PortalConfigKind) {
  switch (kind) {
    case "maintenance":
      return "STRIPE_PORTAL_CONFIG_MAINTENANCE";
    case "theme":
      return "STRIPE_PORTAL_CONFIG_THEME";
    case "slots":
      return "STRIPE_PORTAL_CONFIG_SLOTS";
  }
}

function configKindForAction(action: PortalAction): PortalConfigKind {
  switch (action) {
    case "manage":
    case "cancel":
      return "maintenance";
    case "update_theme":
      return "theme";
    case "update_slots":
      return "slots";
  }
}

async function requireValidatedPortalConfiguration(kind: PortalConfigKind) {
  const configurationId = readPortalConfigurationId(kind);
  const envName = configEnvName(kind);

  if (!configurationId) {
    return {
      ok: false as const,
      error: `portal_configuration_missing:${envName}`,
    };
  }

  const cacheKey = `${kind}:${configurationId}`;
  const cached = validatedConfigCache.get(cacheKey);
  if (cached) return cached;

  try {
    const config =
      await stripe.billingPortal.configurations.retrieve(configurationId);

    const updateEnabled = Boolean(
      config.features?.subscription_update?.enabled
    );

    if (kind === "maintenance") {
      if (updateEnabled) {
        const result = {
          ok: false as const,
          error: "portal_configuration_invalid:subscription_update_enabled",
        };
        validatedConfigCache.set(cacheKey, result);
        return result;
      }
    } else if (!updateEnabled) {
      const result = {
        ok: false as const,
        error: "portal_configuration_invalid:subscription_update_disabled",
      };
      validatedConfigCache.set(cacheKey, result);
      return result;
    }

    const result = { ok: true as const, id: configurationId };
    validatedConfigCache.set(cacheKey, result);
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "portal_configuration_lookup_failed";

    const result = {
      ok: false as const,
      error: `portal_configuration_invalid:${message}`,
    };
    validatedConfigCache.set(cacheKey, result);
    return result;
  }
}

function afterCompletionRedirect(returnUrl: string) {
  return {
    type: "redirect" as const,
    redirect: {
      return_url: returnUrl,
    },
  };
}

export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
  action: PortalAction;
  /** Required for cancel and subscription_update flows. */
  category?: BillingCategory;
}) {
  const configKind = configKindForAction(params.action);
  const configRes = await requireValidatedPortalConfiguration(configKind);
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

  const category =
    params.category ??
    (params.action === "update_theme"
      ? "topic_plan"
      : params.action === "update_slots"
        ? "slots"
        : null);

  if (!category) {
    return {
      ok: false as const,
      error: "portal_category_required",
    };
  }

  const existing = await findActiveSubscriptionItem({
    customerId: params.customerId,
    category,
  });

  if (!existing) {
    return {
      ok: false as const,
      error: `subscription_not_found:${category}`,
    };
  }

  if (params.action === "cancel") {
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
      configuration,
      flow_data: {
        type: "subscription_cancel",
        subscription_cancel: {
          subscription: existing.subscription.id,
        },
        after_completion: afterCompletionRedirect(params.returnUrl),
      },
    });

    console.log("[stripePortal] cancel session", {
      configuration,
      customerId: params.customerId,
      category,
      subscriptionId: existing.subscription.id,
    });

    return { ok: true as const, url: session.url, configuration };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
    configuration,
    flow_data: {
      type: "subscription_update",
      subscription_update: {
        subscription: existing.subscription.id,
      },
      after_completion: afterCompletionRedirect(params.returnUrl),
    },
  });

  console.log("[stripePortal] subscription_update session", {
    configuration,
    configKind,
    customerId: params.customerId,
    category,
    subscriptionId: existing.subscription.id,
  });

  return { ok: true as const, url: session.url, configuration };
}
