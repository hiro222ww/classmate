// app/api/billing/create-portal-session/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function originFromEnv() {
  return (
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = String(body.deviceId ?? "").trim();
    const dev = String(body.dev ?? "").trim();

    // ✅ theme / slot を受け取る
    const kind = String(body.kind ?? "theme").trim();

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId_required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("user_billing_customers")
      .select("stripe_customer_id")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) {
      console.error("read user_billing_customers error:", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    if (!data?.stripe_customer_id) {
      return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
    }

    const origin = originFromEnv();

    const returnUrl = dev
      ? `${origin}/billing?dev=${encodeURIComponent(dev)}`
      : `${origin}/billing`;

    const configuration =
      kind === "slot"
        ? process.env.STRIPE_PORTAL_CONFIG_SLOTS
        : process.env.STRIPE_PORTAL_CONFIG_THEME;

    if (!configuration) {
      return NextResponse.json(
        { error: `portal_configuration_missing:${kind}` },
        { status: 500 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: returnUrl,
      configuration,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("create portal session error:", e);
    return NextResponse.json(
      { error: e?.message ?? "server_error" },
      { status: 500 }
    );
  }
}