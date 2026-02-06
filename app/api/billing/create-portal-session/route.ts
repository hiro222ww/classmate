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

/**
 * deviceId から Stripe customer を特定して、
 * Customer Portal のURLを返す
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = String(body.deviceId ?? "");

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId_required" }, { status: 400 });
    }

    // ✅ deviceId -> stripe_customer_id を取得
    //   （あなたのDBにあるテーブル名に合わせてる）
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
      // まだ課金したことがないユーザー
      return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
    }

    const origin = originFromEnv();

    // ✅ Customer Portal Session 作成
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${origin}/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("create portal session error:", e);
    return NextResponse.json({ error: e?.message ?? "server_error" }, { status: 500 });
  }
}
