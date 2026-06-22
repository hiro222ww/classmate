import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";
import { computeEntitlementsFromSubscriptions } from "@/lib/billingCatalog";
import { resolveRequestIdentity } from "@/lib/requestIdentity";
import { lookupEntitlements } from "@/lib/userIdentityMigration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickDeviceId(req: Request, body: { deviceId?: string }) {
  return req.headers.get("x-device-id") || body?.deviceId || "";
}

async function upsertBillingCustomer(
  deviceId: string,
  customerId: string,
  userId?: string | null
) {
  const { error } = await supabaseAdmin.from("user_billing_customers").upsert(
    {
      device_id: deviceId,
      stripe_customer_id: customerId,
      user_id: userId ?? null,
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

    const resolvedIdentity = await resolveRequestIdentity({ req, deviceId });
    const userId = resolvedIdentity.ok ? resolvedIdentity.identity.userId : null;

    let currentEnt = null;
    try {
      currentEnt = await lookupEntitlements({ userId, deviceId });
    } catch (lookupError: any) {
      return NextResponse.json(
        { ok: false, error: "db_error", detail: lookupError.message },
        { status: 500 }
      );
    }

    if (currentEnt?.manual_override) {
      console.log("[billing/sync] skipped by manual override", {
        deviceId,
        entitlements: currentEnt,
      });

      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "manual_override_enabled",
        deviceId,
        entitlements: currentEnt,
      });
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

    const resolved = computeEntitlementsFromSubscriptions(activeSubs);
    const {
      plan,
      class_slots,
      topic_plan,
      can_create_classes,
      theme_pass,
      unknownPriceIds,
      categoryMismatches,
    } = resolved;

    if (unknownPriceIds.length > 0) {
      console.warn("[billing/sync] ignored unknown priceIds", {
        deviceId,
        customerId,
        unknownPriceIds,
      });
    }

    if (categoryMismatches.length > 0) {
      console.warn("[billing/sync] category mismatches", {
        deviceId,
        customerId,
        categoryMismatches,
      });
    }

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
          user_id: userId,
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
        "device_id,user_id, plan, class_slots, can_create_classes, topic_plan, theme_pass, updated_at, manual_override, manual_override_updated_at"
      )
      .single();

    if (uErr) {
      return NextResponse.json(
        { ok: false, error: "db_error", detail: uErr.message },
        { status: 500 }
      );
    }

    await upsertBillingCustomer(deviceId, customerId, userId);

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