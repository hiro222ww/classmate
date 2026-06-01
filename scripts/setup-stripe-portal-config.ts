/**
 * Stripe Customer Portal configuration checklist.
 *
 * This app uses two Dashboard configs only:
 *   STRIPE_PORTAL_CONFIG_THEME  — theme plan updates/cancel (¥400/800/1200)
 *   STRIPE_PORTAL_CONFIG_SLOTS  — class slot updates/cancel (3/5 classes)
 *
 * Create both in Stripe Dashboard → Settings → Customer portal, then set the
 * configuration IDs in Vercel / .env.local.
 *
 * Optional: verify an existing config ID is reachable:
 *   STRIPE_PORTAL_CONFIG_THEME=bpc_... STRIPE_SECRET_KEY=sk_... npx tsx scripts/setup-stripe-portal-config.ts
 */
import Stripe from "stripe";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }

  const stripe = new Stripe(key);

  const themeId = String(process.env.STRIPE_PORTAL_CONFIG_THEME ?? "").trim();
  const slotsId = String(process.env.STRIPE_PORTAL_CONFIG_SLOTS ?? "").trim();

  if (themeId) {
    const theme = await stripe.billingPortal.configurations.retrieve(themeId);
    console.log("STRIPE_PORTAL_CONFIG_THEME ok:", theme.id);
    console.log(
      "  subscription_update.enabled =",
      theme.features.subscription_update.enabled
    );
  } else {
    console.log("STRIPE_PORTAL_CONFIG_THEME is not set");
  }

  if (slotsId) {
    const slots = await stripe.billingPortal.configurations.retrieve(slotsId);
    console.log("STRIPE_PORTAL_CONFIG_SLOTS ok:", slots.id);
    console.log(
      "  subscription_update.enabled =",
      slots.features.subscription_update.enabled
    );
  } else {
    console.log("STRIPE_PORTAL_CONFIG_SLOTS is not set");
  }

  if (!themeId && !slotsId) {
    console.log("");
    console.log("Set in Vercel / .env.local:");
    console.log("STRIPE_PORTAL_CONFIG_THEME=bpc_...");
    console.log("STRIPE_PORTAL_CONFIG_SLOTS=bpc_...");
    console.log("");
    console.log("Dashboard checklist:");
    console.log("- THEME config: subscription updates ON, theme ¥400/800/1200 only");
    console.log("- SLOTS config: subscription updates ON, class slots 3/5 only");
    console.log("- Enable payment method update + invoice history on both");
  }
}

void main();
