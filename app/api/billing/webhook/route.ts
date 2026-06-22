import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import {
  syncEntitlementsForStripeCustomer,
  upsertBillingCustomerRecord,
} from "@/lib/billingIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const WEBHOOK_SECRET = () => mustEnv("STRIPE_WEBHOOK_SECRET");

export async function POST(req: Request) {
  try {
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new NextResponse("missing stripe-signature", { status: 400 });
    }

    const rawBody = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET());
    } catch (err: any) {
      console.error("[webhook] signature verify failed:", err?.message ?? err);
      return new NextResponse("signature_verification_failed", { status: 400 });
    }

    console.log("[webhook] event.type =", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;

      if (customerId) {
        const userId = String(session.metadata?.user_id ?? "").trim();
        const deviceId = String(session.metadata?.device_id ?? "").trim();

        if (userId && deviceId) {
          await upsertBillingCustomerRecord({
            userId,
            deviceId,
            stripeCustomerId: customerId,
          });
        }

        await syncEntitlementsForStripeCustomer(customerId);
      }

      return NextResponse.json({ ok: true });
    }

    if (
      event.type === "invoice.paid" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const obj = event.data.object as Stripe.Invoice | Stripe.Subscription;
      const customerId =
        typeof obj.customer === "string" ? obj.customer : obj.customer?.id;

      if (customerId) {
        await syncEntitlementsForStripeCustomer(customerId);
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[webhook] fatal:", e);
    return new NextResponse(e?.message ?? "webhook_error", { status: 500 });
  }
}
