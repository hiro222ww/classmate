import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertSellableCheckoutBody,
  computeEntitlementsFromSubscriptions,
} from "@/lib/billingCatalog";
import {
  findActiveSubscriptionItem,
  updateSubscriptionItemPrice,
} from "@/lib/billingSubscriptions";

export const runtime = "nodejs";

type Body = {
  deviceId?: string;
  kind?: "slots" | "topic_plan";
  slotsTotal?: number;
  amount?: number;
  dev?: string;
};

function pickDeviceId(req: Request, body: Body) {
  return String(req.headers.get("x-device-id") || body.deviceId || "").trim();
}

async function getCustomerIdByDeviceId(deviceId: string) {
  const { data } = await supabaseAdmin
    .from("user_billing_customers")
    .select("stripe_customer_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  return String(data?.stripe_customer_id ?? "").trim() || null;
}

async function syncEntitlementsForCustomer(customerId: string, deviceId: string) {
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  });

  const resolved = computeEntitlementsFromSubscriptions(subs.data);

  await supabaseAdmin.from("user_entitlements").upsert(
    {
      device_id: deviceId,
      plan: resolved.plan,
      class_slots: resolved.class_slots,
      can_create_classes: resolved.can_create_classes,
      topic_plan: resolved.topic_plan,
      theme_pass: resolved.theme_pass,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" }
  );

  return resolved;
}

export async function POST(req: Request) {
  try {
    const rawBody = (await req.json().catch(() => ({}))) as Body;
    const deviceId = pickDeviceId(req, rawBody);

    if (!deviceId) {
      return NextResponse.json({ error: "device_id_missing" }, { status: 400 });
    }

    let checkout;
    try {
      checkout = assertSellableCheckoutBody(rawBody);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "invalid_request_body";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const customerId = await getCustomerIdByDeviceId(deviceId);
    if (!customerId) {
      return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
    }

    const existing = await findActiveSubscriptionItem({
      customerId,
      category: checkout.category,
    });

    if (!existing) {
      return NextResponse.json(
        { error: "subscription_not_found", category: checkout.category },
        { status: 404 }
      );
    }

    const updateRes = await updateSubscriptionItemPrice({
      customerId,
      category: checkout.category,
      nextPriceId: checkout.priceId,
      nextRank: checkout.targetRank,
    });

    if (!updateRes.ok) {
      return NextResponse.json({ error: updateRes.error }, { status: 400 });
    }

    const resolved = await syncEntitlementsForCustomer(customerId, deviceId);

    return NextResponse.json({
      ok: true,
      updated: true,
      category: checkout.category,
      entitlements: resolved,
    });
  } catch (e: unknown) {
    console.error("[billing/update-subscription]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
