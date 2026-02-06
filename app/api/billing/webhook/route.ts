// app/api/billing/webhook/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs"; // Stripe署名検証で必要になることがある

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const WEBHOOK_SECRET = () => mustEnv("STRIPE_WEBHOOK_SECRET");

// ここは env で price_id を宣言しておく（あなたがStripeで作ったやつを入れる）
const PRICE_SLOTS_3 = () => mustEnv("STRIPE_PRICE_SLOTS_3");
const PRICE_SLOTS_5 = () => mustEnv("STRIPE_PRICE_SLOTS_5");
const PRICE_TOPIC_400 = () => mustEnv("STRIPE_PRICE_TOPIC_400");
const PRICE_TOPIC_800 = () => mustEnv("STRIPE_PRICE_TOPIC_800");
const PRICE_TOPIC_1200 = () => mustEnv("STRIPE_PRICE_TOPIC_1200");

function computeFromActiveSubscriptions(subs: Stripe.Subscription[]) {
  let class_slots = 1;
  let topic_plan = 0;

  for (const sub of subs) {
    if (sub.status !== "active" && sub.status !== "trialing") continue;

    for (const item of sub.items.data) {
      const priceId = item.price?.id;
      if (!priceId) continue;

      if (priceId === PRICE_SLOTS_3()) class_slots = Math.max(class_slots, 3);
      if (priceId === PRICE_SLOTS_5()) class_slots = Math.max(class_slots, 5);

      if (priceId === PRICE_TOPIC_400()) topic_plan = Math.max(topic_plan, 400);
      if (priceId === PRICE_TOPIC_800()) topic_plan = Math.max(topic_plan, 800);
      if (priceId === PRICE_TOPIC_1200()) topic_plan = Math.max(topic_plan, 1200);
    }
  }

  return { class_slots, topic_plan };
}

async function ensureCustomerMapping(deviceId: string, customerId: string) {
  const { error } = await supabaseAdmin
    .from("user_billing_customers")
    .upsert({ device_id: deviceId, stripe_customer_id: customerId }, { onConflict: "device_id" });

  if (error) throw error;
}

async function syncEntitlementsByCustomer(customerId: string) {
  // deviceId を customer.metadata から拾う（無ければDBマッピングから拾う）
  const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
  const deviceIdFromMeta = (customer.metadata?.deviceId ?? "").toString();

  let deviceId = deviceIdFromMeta;

  if (!deviceId) {
    const { data, error } = await supabaseAdmin
      .from("user_billing_customers")
      .select("device_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (error) throw error;
    deviceId = data?.device_id ?? "";
  }

  if (!deviceId) {
    console.warn("deviceId not found for customer:", customerId);
    return;
  }

  // そのcustomerのサブスク一覧
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    expand: ["data.items.data.price"],
    limit: 100,
  });

  const { class_slots, topic_plan } = computeFromActiveSubscriptions(subs.data);

  // entitlements更新（theme_pass互換が残ってるなら false に寄せるなど好みで）
  const { error: upErr } = await supabaseAdmin
    .from("user_entitlements")
    .update({
      class_slots,
      topic_plan,
      theme_pass: topic_plan >= 1200 ? true : false, // 互換用（要らなければ消してOK）
      updated_at: new Date().toISOString(),
    })
    .eq("device_id", deviceId);

  if (upErr) throw upErr;

  // 念のため customer mapping も保存
  await ensureCustomerMapping(deviceId, customerId);
}

export async function POST(req: Request) {
  try {
    const sig = req.headers.get("stripe-signature");
    if (!sig) return new NextResponse("missing stripe-signature", { status: 400 });

    const rawBody = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET());
    } catch (err: any) {
      console.error("Webhook signature verify failed:", err?.message ?? err);
      return new NextResponse("signature_verification_failed", { status: 400 });
    }

    // ---- events ----
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (!customerId) return NextResponse.json({ ok: true });

      // metadataにdeviceIdを入れてるので、あればDB紐付けを確実にする
      const deviceId = (session.metadata?.deviceId ?? "").toString();
      if (deviceId) await ensureCustomerMapping(deviceId, customerId);

      await syncEntitlementsByCustomer(customerId);
      return NextResponse.json({ ok: true });
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (customerId) await syncEntitlementsByCustomer(customerId);
      return NextResponse.json({ ok: true });
    }

    // 他イベントは無視
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("webhook error:", e);
    return new NextResponse(e?.message ?? "webhook_error", { status: 500 });
  }
}
