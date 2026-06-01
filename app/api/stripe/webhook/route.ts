// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeEntitlementsFromSubscriptions } from "@/lib/billingCatalog";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sig = req.headers.get("stripe-signature");
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !whsec) {
      return NextResponse.json(
        { error: "Missing STRIPE_WEBHOOK_SECRET or signature" },
        { status: 400 }
      );
    }

    const raw = await req.text();
    const event = stripe.webhooks.constructEvent(raw, sig, whsec);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const deviceId = String(session.metadata?.deviceId ?? "").trim();
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;

      if (deviceId && customerId) {
        await supabaseAdmin.from("user_billing_customers").upsert(
          {
            device_id: deviceId,
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "device_id" }
        );
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

      if (customerId) {
        const { data: rows, error } = await supabaseAdmin
          .from("user_billing_customers")
          .select("device_id")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (error) throw error;

        const deviceId = rows?.[0]?.device_id;
        if (deviceId) {
          const resolved = computeEntitlementsFromSubscriptions([sub]);
          await supabaseAdmin.from("user_entitlements").upsert(
            {
              device_id: deviceId,
              plan: resolved.plan,
              topic_plan: resolved.topic_plan,
              class_slots: resolved.class_slots,
              can_create_classes: resolved.can_create_classes,
              theme_pass: resolved.theme_pass,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "device_id" }
          );
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    console.error("[webhook] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
