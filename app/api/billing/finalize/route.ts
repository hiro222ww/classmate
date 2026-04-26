import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function mustGetDeviceId(req: Request) {
  const deviceId =
    req.headers.get("x-device-id") || req.headers.get("X-Device-Id");
  return deviceId || null;
}

function resolveTopicPlan(priceIds: string[]) {
  const map: Record<string, number> = {
    [process.env.STRIPE_PRICE_TOPIC_400 ?? ""]: 400,
    [process.env.STRIPE_PRICE_TOPIC_800 ?? ""]: 800,
    [process.env.STRIPE_PRICE_TOPIC_1200 ?? ""]: 1200,
  };

  let best = 0;
  for (const id of priceIds) {
    best = Math.max(best, map[id] ?? 0);
  }
  return best;
}

function resolveClassSlots(priceIds: string[]) {
  const map: Record<string, number> = {
    [process.env.STRIPE_PRICE_SLOTS_1 ?? ""]: 1,
    [process.env.STRIPE_PRICE_SLOTS_3 ?? ""]: 3,
    [process.env.STRIPE_PRICE_SLOTS_5 ?? ""]: 5,
  };

  let best = 0;
  for (const id of priceIds) {
    best = Math.max(best, map[id] ?? 0);
  }

  return best > 0 ? best : 1;
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

async function upsertBillingCustomer(deviceId: string, customerId: string) {
  const { error } = await supabaseAdmin.from("user_billing_customers").upsert(
    {
      device_id: deviceId,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" }
  );

  if (error) {
    throw new Error(`billing_customer_upsert_failed:${error.message}`);
  }
}

export async function POST(req: Request) {
  try {
    const deviceId = mustGetDeviceId(req);

    if (!deviceId) {
      return NextResponse.json(
        { error: "missing_x_device_id" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const session_id = body?.session_id;

    if (!session_id || typeof session_id !== "string") {
      return NextResponse.json(
        { error: "missing_session_id" },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription", "subscription.items.data.price"],
    });

    // ✅ 支払い完了チェック
    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          error: "payment_not_completed",
          payment_status: session.payment_status,
        },
        { status: 402 }
      );
    }

    // ✅ 他人のCheckout Sessionを使った反映防止
    if (session.client_reference_id !== deviceId) {
      return NextResponse.json(
        {
          error: "device_mismatch",
          session_client_reference_id: session.client_reference_id,
        },
        { status: 403 }
      );
    }

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

    if (!customerId) {
      return NextResponse.json(
        { error: "customer_missing_in_session" },
        { status: 400 }
      );
    }

    const sessionSub = session.subscription as Stripe.Subscription | null;

    if (!sessionSub) {
      return NextResponse.json(
        { error: "subscription_missing_in_session" },
        { status: 400 }
      );
    }

    if (!(sessionSub.status === "active" || sessionSub.status === "trialing")) {
      return NextResponse.json(
        {
          error: "subscription_not_active",
          stripe_status: sessionSub.status,
        },
        { status: 409 }
      );
    }

    await upsertBillingCustomer(deviceId, customerId);

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
      expand: ["data.items.data.price"],
    });

    const activeSubs = subs.data.filter(
      (s) => s.status === "active" || s.status === "trialing"
    );

    const priceIds = activeSubs.flatMap((sub) =>
      sub.items.data
        .map((item) => item.price?.id)
        .filter((x): x is string => !!x)
    );

    const topic_plan = resolveTopicPlan(priceIds);
    const class_slots = resolveClassSlots(priceIds);

    const hasKnownPrice = topic_plan > 0 || class_slots > 1;

    if (!hasKnownPrice) {
      return NextResponse.json(
        {
          error: "price_mapping_not_found",
          priceIds,
          expected: {
            STRIPE_PRICE_SLOTS_1: process.env.STRIPE_PRICE_SLOTS_1 ?? null,
            STRIPE_PRICE_SLOTS_3: process.env.STRIPE_PRICE_SLOTS_3 ?? null,
            STRIPE_PRICE_SLOTS_5: process.env.STRIPE_PRICE_SLOTS_5 ?? null,
            STRIPE_PRICE_TOPIC_400: process.env.STRIPE_PRICE_TOPIC_400 ?? null,
            STRIPE_PRICE_TOPIC_800: process.env.STRIPE_PRICE_TOPIC_800 ?? null,
            STRIPE_PRICE_TOPIC_1200: process.env.STRIPE_PRICE_TOPIC_1200 ?? null,
          },
          hint: "Checkoutで使われたpriceと .env.local の STRIPE_PRICE_* が同じ環境(test/live)か確認",
        },
        { status: 409 }
      );
    }

    const plan = resolvePlan({ class_slots, topic_plan });
    const can_create_classes = class_slots > 1 || topic_plan > 0;
    const theme_pass = topic_plan > 0;

    console.log("[billing/finalize] deviceId =", deviceId);
    console.log("[billing/finalize] session_id =", session_id);
    console.log("[billing/finalize] customerId =", customerId);
    console.log("[billing/finalize] sessionSubId =", sessionSub.id);
    console.log(
      "[billing/finalize] active subscriptions =",
      activeSubs.map((s) => ({
        id: s.id,
        status: s.status,
        priceIds: s.items.data
          .map((item) => item.price?.id)
          .filter((x): x is string => !!x),
      }))
    );
    console.log("[billing/finalize] merged priceIds =", priceIds);
    console.log("[billing/finalize] resolved =", {
      plan,
      class_slots,
      topic_plan,
      can_create_classes,
      theme_pass,
    });

    const { data: ent, error: entErr } = await supabaseAdmin
      .from("user_entitlements")
      .upsert(
        {
          device_id: deviceId,
          plan,
          class_slots,
          can_create_classes,
          topic_plan,
          theme_pass,
          manual_override: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id" }
      )
      .select(
        "device_id, plan, class_slots, can_create_classes, topic_plan, theme_pass, updated_at, manual_override"
      )
      .maybeSingle();

    if (entErr) {
      return NextResponse.json(
        {
          error: "entitlements_upsert_failed",
          detail: entErr.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deviceId,
      customerId,
      activeSubscriptions: activeSubs.map((s) => ({
        id: s.id,
        status: s.status,
      })),
      priceIds,
      entitlements: ent,
    });
  } catch (e: any) {
    console.error("[billing/finalize] fatal", e);

    return NextResponse.json(
      { error: e?.message ?? "finalize_failed" },
      { status: 500 }
    );
  }
}