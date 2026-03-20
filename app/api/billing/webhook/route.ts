import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const WEBHOOK_SECRET = () => mustEnv("STRIPE_WEBHOOK_SECRET");

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

function resolvePlan(params: { class_slots: number; topic_plan: number }) {
  const { class_slots, topic_plan } = params;

  if (topic_plan >= 1200) return "topic_1200";
  if (topic_plan >= 800) return "topic_800";
  if (topic_plan >= 400) return "topic_400";
  if (class_slots >= 5) return "slots_5";
  if (class_slots >= 3) return "slots_3";
  return "free";
}

async function ensureCustomerMapping(deviceId: string, customerId: string) {
  const { error } = await supabaseAdmin
    .from("user_billing_customers")
    .upsert(
      {
        device_id: deviceId,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" }
    );

  if (error) throw error;
}

async function resolveDeviceIdByCustomer(customerId: string): Promise<string> {
  const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;

  const deviceIdFromMeta =
    (customer.metadata?.deviceId ?? "").toString() ||
    (customer.metadata?.device_id ?? "").toString();

  if (deviceIdFromMeta) return deviceIdFromMeta;

  const { data, error } = await supabaseAdmin
    .from("user_billing_customers")
    .select("device_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) throw error;

  return data?.device_id ?? "";
}

async function syncEntitlementsByCustomer(customerId: string) {
  const deviceId = await resolveDeviceIdByCustomer(customerId);

  if (!deviceId) {
    console.warn("[webhook] deviceId not found for customer:", customerId);
    return;
  }

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    expand: ["data.items.data.price"],
    limit: 100,
  });

  const { class_slots, topic_plan } = computeFromActiveSubscriptions(subs.data);
  const plan = resolvePlan({ class_slots, topic_plan });
  const can_create_classes = class_slots > 1 || topic_plan > 0;
  const theme_pass = topic_plan > 0;

  const { error: upErr } = await supabaseAdmin
    .from("user_entitlements")
    .upsert(
      {
        device_id: deviceId,
        plan,
        class_slots,
        can_create_classes,
        topic_plan,
        theme_pass,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" }
    );

  if (upErr) throw upErr;

  await ensureCustomerMapping(deviceId, customerId);

  console.log("[webhook] synced entitlements", {
    deviceId,
    customerId,
    plan,
    class_slots,
    topic_plan,
    can_create_classes,
    theme_pass,
  });
}

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
      console.log("[webhook] checkout.session.completed");

      const session = event.data.object as Stripe.Checkout.Session;

      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;

      if (!customerId) {
        return NextResponse.json({ ok: true });
      }

      const deviceId =
        (session.metadata?.deviceId ?? "").toString() ||
        (session.metadata?.device_id ?? "").toString();

      if (deviceId) {
        await ensureCustomerMapping(deviceId, customerId);
      }

      await syncEntitlementsByCustomer(customerId);
      return NextResponse.json({ ok: true });
    }

    if (event.type === "invoice.paid") {
      console.log("[webhook] invoice.paid");

      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;

      if (customerId) {
        await syncEntitlementsByCustomer(customerId);
      }

      return NextResponse.json({ ok: true });
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      console.log("[webhook] subscription changed:", event.type);

      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string"
          ? sub.customer
          : sub.customer?.id;

      if (customerId) {
        await syncEntitlementsByCustomer(customerId);
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[webhook] fatal:", e);
    return new NextResponse(e?.message ?? "webhook_error", { status: 500 });
  }
}