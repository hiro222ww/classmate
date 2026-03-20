// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = body?.deviceId || "";
    const priceId = body?.priceId || "";

    if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    if (!priceId) return NextResponse.json({ error: "priceId required" }, { status: 400 });

    // 既存 customer があるなら再利用
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

      await supabaseAdmin
        .from("user_billing_customers")
        .upsert(
          { device_id: deviceId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
          { onConflict: "device_id" }
        );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is missing");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/class/select?checkout=success`,
      cancel_url: `${baseUrl}/class/select?checkout=cancel`,
      metadata: { deviceId },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e: any) {
    console.error("[stripe/checkout] error", e);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}