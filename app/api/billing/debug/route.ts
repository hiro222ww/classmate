import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = String(body?.deviceId ?? "");
    if (!deviceId) return NextResponse.json({ ok: false, error: "deviceId_required" }, { status: 400 });

    // 1) classmate(DB)に customer紐付けがあるか
    const { data: map, error: mErr } = await supabaseAdmin
      .from("user_billing_customers")
      .select("stripe_customer_id")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (mErr) throw mErr;

    const customerId = map?.stripe_customer_id ?? "";
    if (!customerId) {
      return NextResponse.json({ ok: true, deviceId, customerId: "", subs: [], note: "no_customer_mapping" });
    }

    // 2) Stripeにサブスクが本当にあるか
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      expand: ["data.items.data.price"],
      limit: 20,
    });

    const simplified = subs.data.map((s) => ({
      id: s.id,
      status: s.status,
      cancel_at_period_end: s.cancel_at_period_end,
      items: s.items.data.map((i) => ({
        price_id: i.price?.id,
        lookup_key: (i.price as any)?.lookup_key ?? null,
        nickname: (i.price as any)?.nickname ?? null,
      })),
    }));

    return NextResponse.json({
      ok: true,
      deviceId,
      customerId,
      subs: simplified,
    });
  } catch (e: any) {
    console.error("[billing/debug] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "debug_failed" }, { status: 500 });
  }
}