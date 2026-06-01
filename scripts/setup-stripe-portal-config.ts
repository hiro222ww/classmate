/**
 * Setup or repair Stripe Customer Portal maintenance configuration.
 *
 * Run:
 *   STRIPE_SECRET_KEY=sk_... npx tsx scripts/setup-stripe-portal-config.ts
 *
 * Optional update existing:
 *   STRIPE_PORTAL_CONFIG_MAINTENANCE=bpc_... STRIPE_SECRET_KEY=sk_... npx tsx scripts/setup-stripe-portal-config.ts
 */
import Stripe from "stripe";

const MAINTENANCE_FEATURES: Stripe.BillingPortal.ConfigurationCreateParams.Features =
  {
    subscription_update: {
      enabled: false,
    },
    subscription_cancel: {
      enabled: false,
    },
    payment_method_update: {
      enabled: true,
    },
    invoice_history: {
      enabled: true,
    },
    customer_update: {
      enabled: true,
      allowed_updates: ["email", "address", "phone"],
    },
  };

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }

  const stripe = new Stripe(key);
  const existingId = String(
    process.env.STRIPE_PORTAL_CONFIG_MAINTENANCE ?? ""
  ).trim();

  if (existingId) {
    const updated = await stripe.billingPortal.configurations.update(
      existingId,
      {
        features: MAINTENANCE_FEATURES,
      }
    );

    console.log("Updated Stripe portal configuration:");
    console.log(updated.id);
    console.log(
      "subscription_update.enabled =",
      updated.features.subscription_update.enabled
    );
    console.log(
      "subscription_cancel.enabled =",
      updated.features.subscription_cancel.enabled
    );
    return;
  }

  const config = await stripe.billingPortal.configurations.create({
    business_profile: {
      privacy_policy_url: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/terms`
        : undefined,
    },
    features: MAINTENANCE_FEATURES,
  });

  console.log("Created Stripe portal configuration:");
  console.log(config.id);
  console.log("");
  console.log("Add to Vercel / .env.local:");
  console.log(`STRIPE_PORTAL_CONFIG_MAINTENANCE=${config.id}`);
  console.log("");
  console.log("Also configure in Stripe Dashboard (subscription updates ON):");
  console.log("STRIPE_PORTAL_CONFIG_THEME=bpc_...   # theme ¥400/800/1200 only");
  console.log("STRIPE_PORTAL_CONFIG_SLOTS=bpc_...   # class slots 3/5 only");
}

void main();
