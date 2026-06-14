// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSellablePriceId } from "@/lib/billingCatalog";
import { resolveAppOrigin } from "@/lib/appOrigin";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = String(body?.deviceId ?? "").trim();
    const priceId = String(body?.priceId ?? "").trim();

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }

    if (!priceId || !isSellablePriceId(priceId)) {
      return NextResponse.json({ error: "price_not_allowed" }, { status: 400 });
    }

    const { data: billing, error: bErr } = await supabaseAdmin
      .from("user_billing_customers")
      .select("device_id, stripe_customer_id")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (bErr) throw bErr;

    let customerId = billing?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { deviceId } });
      customerId = customer.id;

      await supabaseAdmin.from("user_billing_customers").upsert(
        {
          device_id: deviceId,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id" }
      );
    }

    const baseUrl = resolveAppOrigin();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/class/select?checkout=success`,
      cancel_url: `${baseUrl}/class/select?checkout=cancel`,
      metadata: { deviceId },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e: unknown) {
    console.error("[stripe/checkout] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
