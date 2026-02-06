import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is missing (set it in .env.local)");
  }
  if (!cached) {
    cached = new Stripe(key, { typescript: true });
  }
  return cached;
}

// ✅ 互換：既存コードが import { stripe } from "@/lib/stripe" でも動く
export const stripe = getStripe();
