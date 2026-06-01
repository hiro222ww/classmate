/**
 * One-time setup helper for Stripe Customer Portal maintenance configuration.
 * Run with: npx tsx scripts/setup-stripe-portal-config.ts
 *
 * Creates a portal configuration with subscription updates disabled.
 * Set STRIPE_PORTAL_CONFIG_MAINTENANCE to the printed configuration id.
 */
import Stripe from "stripe";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }

  const stripe = new Stripe(key);

  const config = await stripe.billingPortal.configurations.create({
    business_profile: {
      privacy_policy_url:
        process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/terms`
          : undefined,
    },
    features: {
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
    },
  });

  console.log("Created Stripe portal configuration:");
  console.log(config.id);
  console.log("");
  console.log("Add to .env.local:");
  console.log(`STRIPE_PORTAL_CONFIG_MAINTENANCE=${config.id}`);
}

void main();
