import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId =
      req.headers.get("x-device-id") || body.deviceId || "";

    if (!deviceId) {
      return NextResponse.json(
        { error: "device_id_missing" },
        { status: 400 }
      );
    }

    // 🔥 Stripe customer 取得
    const { data, error } = await supabaseAdmin
      .from("user_billing_customers")
      .select("customer_id")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error || !data?.customer_id) {
      return NextResponse.json(
        { error: "customer_not_found" },
        { status: 404 }
      );
    }

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    // 🔥 Portal セッション作成
    const session = await stripe.billingPortal.sessions.create({
      customer: data.customer_id,
      return_url: `${origin}/class/select`,
    });

    return NextResponse.json({
      url: session.url,
    });
  } catch (e: any) {
    console.error("[billing/portal] error", e);

    return NextResponse.json(
      { error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}