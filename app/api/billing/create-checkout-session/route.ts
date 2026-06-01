import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { assertSellableCheckoutBody } from "@/lib/billingCatalog";
import {
  findActiveSubscriptionItem,
  updateSubscriptionItemPrice,
} from "@/lib/billingSubscriptions";
import type Stripe from "stripe";

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

function normalizeDev(v: unknown) {
  return String(v ?? "").trim();
}

async function getCustomerIdByDeviceId(deviceId: string) {
  const { data } = await supabaseAdmin
    .from("user_billing_customers")
    .select("stripe_customer_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  return String(data?.stripe_customer_id ?? "").trim() || null;
}

function buildSuccessUrl(origin: string, dev: string) {
  const p = new URLSearchParams();
  p.set("paid", "1");
  p.set("session_id", "{CHECKOUT_SESSION_ID}");
  if (dev) p.set("dev", dev);

  return `${origin}/class/select?${p
    .toString()
    .replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}")}`;
}

function buildCancelUrl(origin: string, dev: string) {
  const p = new URLSearchParams();
  p.set("canceled", "1");
  if (dev) p.set("dev", dev);

  return `${origin}/class/select?${p.toString()}`;
}

export async function POST(req: Request) {
  try {
    const rawBody = (await req.json().catch(() => ({}))) as Body;
    const deviceId = pickDeviceId(req, rawBody).trim();
    const dev = normalizeDev(rawBody.dev);

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

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const success_url = buildSuccessUrl(origin, dev);
    const cancel_url = buildCancelUrl(origin, dev);

    const metadata: Stripe.MetadataParam =
      checkout.category === "slots"
        ? {
            deviceId,
            dev,
            kind: "slots",
            slotsTotal: String(checkout.targetRank),
          }
        : {
            deviceId,
            dev,
            kind: "topic_plan",
            amount: String(checkout.targetRank),
          };

    const customerId = await getCustomerIdByDeviceId(deviceId);

    if (customerId) {
      const existing = await findActiveSubscriptionItem({
        customerId,
        category: checkout.category,
      });

      if (existing) {
        const updateRes = await updateSubscriptionItemPrice({
          customerId,
          category: checkout.category,
          nextPriceId: checkout.priceId,
          nextRank: checkout.targetRank,
        });

        if (!updateRes.ok) {
          return NextResponse.json({ error: updateRes.error }, { status: 400 });
        }

        return NextResponse.json({
          ok: true,
          updated: true,
          subscriptionId: updateRes.subscription.id,
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: checkout.priceId, quantity: 1 }],
      success_url,
      cancel_url,
      client_reference_id: deviceId,
      metadata,
      subscription_data: { metadata },
      ...(customerId ? { customer: customerId } : {}),
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (e: unknown) {
    console.error("[billing/create-checkout-session]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
