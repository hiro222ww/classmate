import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickDeviceId(req: Request, body: any) {
  return req.headers.get("x-device-id") || body?.deviceId || "";
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
    throw new Error(`db_error:${error.message}`);
  }
}

async function getCustomerIdByDeviceId(deviceId: string) {
  const { data: billing, error: bErr } = await supabaseAdmin
    .from("user_billing_customers")
    .select("device_id, stripe_customer_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (bErr) {
    throw new Error(`db_error:${bErr.message}`);
  }

  if (billing?.stripe_customer_id) {
    return billing.stripe_customer_id;
  }

  try {
    const bySnake = await stripe.customers.search({
      query: `metadata['device_id']:'${deviceId}'`,
      limit: 1,
    });

    const foundSnake = bySnake.data?.[0]?.id;
    if (foundSnake) {
      await upsertBillingCustomer(deviceId, foundSnake);
      return foundSnake;
    }
  } catch (e) {
    console.warn("[billing/sync] customer search failed by device_id", e);
  }

  try {
    const byCamel = await stripe.customers.search({
      query: `metadata['deviceId']:'${deviceId}'`,
      limit: 1,
    });

    const foundCamel = byCamel.data?.[0]?.id;
    if (foundCamel) {
      await upsertBillingCustomer(deviceId, foundCamel);
      return foundCamel;
    }
  } catch (e) {
    console.warn("[billing/sync] customer search failed by deviceId", e);
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = pickDeviceId(req, body);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    const customerId = await getCustomerIdByDeviceId(deviceId);
    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "billing_customer_missing", deviceId },
        { status: 404 }
      );
    }

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
        .map((it) => it.price?.id)
        .filter((x): x is string => !!x)
    );

    const topic_plan = resolveTopicPlan(priceIds);
    const class_slots = resolveClassSlots(priceIds);
    const plan = resolvePlan({ class_slots, topic_plan });
    const can_create_classes = class_slots > 1 || topic_plan > 0;
    const theme_pass = topic_plan > 0;

    console.log("[billing/sync] deviceId =", deviceId);
    console.log("[billing/sync] customerId =", customerId);
    console.log(
      "[billing/sync] active subscriptions =",
      activeSubs.map((s) => ({
        id: s.id,
        status: s.status,
        priceIds: s.items.data
          .map((it) => it.price?.id)
          .filter((x): x is string => !!x),
      }))
    );
    console.log("[billing/sync] merged priceIds =", priceIds);
    console.log("[billing/sync] resolved =", {
      plan,
      class_slots,
      topic_plan,
      can_create_classes,
      theme_pass,
    });

    const { data: ent, error: uErr } = await supabaseAdmin
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
      )
      .select(
        "device_id, plan, class_slots, can_create_classes, topic_plan, theme_pass, updated_at"
      )
      .single();

    if (uErr) {
      return NextResponse.json(
        { ok: false, error: "db_error", detail: uErr.message },
        { status: 500 }
      );
    }

    await upsertBillingCustomer(deviceId, customerId);

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
    console.error("[billing/sync] fatal", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}