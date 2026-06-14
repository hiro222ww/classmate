import { stripe } from "@/lib/stripe";
import type { BillingCategory } from "@/lib/billingCatalog";
import { findActiveSubscriptionItem } from "@/lib/billingSubscriptions";

/**
 * Portal sessions use STRIPE_PORTAL_CONFIG_THEME or STRIPE_PORTAL_CONFIG_SLOTS.
 * Plan updates and cancels are opened via flow_data deep links for the
 * subscription in that billing category only.
 */
export type PortalAction =
  | "update_theme"
  | "update_slots"
  | "cancel_theme"
  | "cancel_slots";

type PortalConfigKind = "theme" | "slots";

const validatedConfigCache = new Map<
  string,
  { ok: true; id: string } | { ok: false; error: string }
>();

function readPortalConfigurationId(kind: PortalConfigKind) {
  switch (kind) {
    case "theme":
      return String(process.env.STRIPE_PORTAL_CONFIG_THEME ?? "").trim();
    case "slots":
      return String(process.env.STRIPE_PORTAL_CONFIG_SLOTS ?? "").trim();
  }
}

function configEnvName(kind: PortalConfigKind) {
  switch (kind) {
    case "theme":
      return "STRIPE_PORTAL_CONFIG_THEME";
    case "slots":
      return "STRIPE_PORTAL_CONFIG_SLOTS";
  }
}

export function portalConfigEnvForAction(action: PortalAction) {
  return configEnvName(configKindForAction(action));
}

function configKindForAction(action: PortalAction): PortalConfigKind {
  switch (action) {
    case "update_theme":
    case "cancel_theme":
      return "theme";
    case "update_slots":
    case "cancel_slots":
      return "slots";
  }
}

function categoryForAction(action: PortalAction): BillingCategory {
  switch (action) {
    case "update_theme":
    case "cancel_theme":
      return "topic_plan";
    case "update_slots":
    case "cancel_slots":
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
    await stripe.billingPortal.configurations.retrieve(configurationId);

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
}) {
  const configKind = configKindForAction(params.action);
  const configRes = await requireValidatedPortalConfiguration(configKind);
  if (!configRes.ok) {
    return configRes;
  }

  const configuration = configRes.id;
  const category = categoryForAction(params.action);

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

  if (
    params.action === "cancel_theme" ||
    params.action === "cancel_slots"
  ) {
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
      configKind,
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
    category,
    subscriptionId: existing.subscription.id,
  });

  return { ok: true as const, url: session.url, configuration };
}
