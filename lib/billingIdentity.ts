import { resolvePrimaryDeviceForUser } from "@/lib/actorIdentity";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";
import { computeEntitlementsFromSubscriptions } from "@/lib/billingCatalog";
import { resolveStripeCustomerIdentityFromSources } from "@/lib/resolveStripeCustomerIdentity";
import type Stripe from "stripe";

export type BillingCustomerRecord = {
  device_id: string;
  user_id: string | null;
  stripe_customer_id: string;
};

export async function getBillingCustomerByUserId(userId: string) {
  const normalized = String(userId ?? "").trim();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("user_billing_customers")
    .select("device_id,user_id,stripe_customer_id")
    .eq("user_id", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BillingCustomerRecord | null;
}

export async function getBillingCustomerByDeviceId(deviceId: string) {
  const normalized = String(deviceId ?? "").trim();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("user_billing_customers")
    .select("device_id,user_id,stripe_customer_id")
    .eq("device_id", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BillingCustomerRecord | null;
}

export async function getBillingCustomerByStripeCustomerId(
  stripeCustomerId: string
) {
  const normalized = String(stripeCustomerId ?? "").trim();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("user_billing_customers")
    .select("device_id,user_id,stripe_customer_id")
    .eq("stripe_customer_id", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BillingCustomerRecord | null;
}

export async function resolveBillingCustomer(params: {
  userId?: string | null;
  deviceId?: string | null;
}) {
  const userId = String(params.userId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();

  if (userId) {
    const byUser = await getBillingCustomerByUserId(userId);
    if (byUser) return byUser;
  }

  if (deviceId) {
    return getBillingCustomerByDeviceId(deviceId);
  }

  return null;
}

export async function upsertBillingCustomerRecord(params: {
  userId: string;
  deviceId: string;
  stripeCustomerId: string;
}) {
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from("user_billing_customers").upsert(
    {
      user_id: params.userId,
      device_id: params.deviceId,
      stripe_customer_id: params.stripeCustomerId,
      updated_at: now,
    },
    { onConflict: "device_id" }
  );

  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("user_billing_customers")
    .update({ user_id: params.userId, updated_at: now })
    .eq("stripe_customer_id", params.stripeCustomerId);
}

export async function upsertEntitlementsFromResolved(params: {
  userId: string;
  deviceId: string;
  resolved: ReturnType<typeof computeEntitlementsFromSubscriptions>;
}) {
  const now = new Date().toISOString();
  const payload = {
    user_id: params.userId,
    device_id: params.deviceId,
    plan: params.resolved.plan,
    class_slots: params.resolved.class_slots,
    can_create_classes: params.resolved.can_create_classes,
    topic_plan: params.resolved.topic_plan,
    theme_pass: params.resolved.theme_pass,
    manual_override: false,
    updated_at: now,
  };

  const { data: byUser } = await supabaseAdmin
    .from("user_entitlements")
    .select("device_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (byUser?.device_id && byUser.device_id !== params.deviceId) {
    const { error } = await supabaseAdmin
      .from("user_entitlements")
      .update(payload)
      .eq("user_id", params.userId);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabaseAdmin
    .from("user_entitlements")
    .upsert(payload, { onConflict: "device_id" });

  if (error) throw new Error(error.message);
}

export async function syncEntitlementsForStripeCustomer(customerId: string) {
  const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;

  const userId =
    String(customer.metadata?.user_id ?? customer.metadata?.userId ?? "").trim() ||
    null;
  const deviceId =
    String(customer.metadata?.device_id ?? customer.metadata?.deviceId ?? "").trim() ||
    null;

  const mapping = await getBillingCustomerByStripeCustomerId(customerId);
  const identityResolved = resolveStripeCustomerIdentityFromSources({
    metadataUserId: userId,
    metadataDeviceId: deviceId,
    mapping,
  });

  let resolvedUserId = identityResolved.userId;
  let resolvedDeviceId = identityResolved.deviceId;

  if (resolvedUserId && !resolvedDeviceId) {
    resolvedDeviceId = await resolvePrimaryDeviceForUser(resolvedUserId);
  }

  if (!resolvedUserId && resolvedDeviceId) {
    const byDevice = await getBillingCustomerByDeviceId(resolvedDeviceId);
    resolvedUserId = byDevice?.user_id ?? null;
  }

  if (!resolvedUserId) {
    console.warn("[billing] unable to resolve user_id for customer", customerId);
    return null;
  }

  if (!resolvedDeviceId) {
    resolvedDeviceId = await resolvePrimaryDeviceForUser(resolvedUserId);
  }

  if (!resolvedDeviceId) {
    console.warn("[billing] unable to resolve device_id for customer", customerId, {
      userId: resolvedUserId,
    });
    return null;
  }

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  });

  const entitlementResolved = computeEntitlementsFromSubscriptions(subs.data);
  await upsertEntitlementsFromResolved({
    userId: resolvedUserId,
    deviceId: resolvedDeviceId,
    resolved: entitlementResolved,
  });
  await upsertBillingCustomerRecord({
    userId: resolvedUserId,
    deviceId: resolvedDeviceId,
    stripeCustomerId: customerId,
  });

  return {
    userId: resolvedUserId,
    deviceId: resolvedDeviceId,
    resolved: entitlementResolved,
  };
}

export { resolveStripeCustomerIdentityFromSources } from "@/lib/resolveStripeCustomerIdentity";

export function buildStripeIdentityMetadata(params: {
  userId: string;
  deviceId: string;
  extra?: Record<string, string>;
}) {
  return {
    user_id: params.userId,
    userId: params.userId,
    device_id: params.deviceId,
    deviceId: params.deviceId,
    ...(params.extra ?? {}),
  };
}
