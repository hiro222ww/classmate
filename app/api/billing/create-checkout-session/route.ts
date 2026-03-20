import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body =
  | { deviceId: string; kind: "slots"; slotsTotal: 3 | 5 }
  | { deviceId: string; kind: "topic_plan"; amount: 400 | 800 | 1200 };

function pickDeviceId(req: Request, body: any) {
  return req.headers.get("x-device-id") || body?.deviceId || "";
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name}_missing`);
  return v;
}

function priceIdFor(body: Body) {
  if (body.kind === "slots") {
    if (body.slotsTotal === 3) return mustEnv("STRIPE_PRICE_SLOTS_3");
    if (body.slotsTotal === 5) return mustEnv("STRIPE_PRICE_SLOTS_5");
    throw new Error("invalid_slotsTotal");
  }

  if (body.amount === 400) return mustEnv("STRIPE_PRICE_TOPIC_400");
  if (body.amount === 800) return mustEnv("STRIPE_PRICE_TOPIC_800");
  if (body.amount === 1200) return mustEnv("STRIPE_PRICE_TOPIC_1200");

  throw new Error("invalid_amount");
}

async function ensureCustomerId(deviceId: string) {
  const { data: billing, error: bErr } = await supabaseAdmin
    .from("user_billing_customers")
    .select("device_id, stripe_customer_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (bErr) throw new Error(`db_error:${bErr.message}`);

  if (billing?.stripe_customer_id) {
    return billing.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    metadata: {
      deviceId: deviceId,
      app: "classmate",
    },
  });

  const { error: uErr } = await supabaseAdmin
    .from("user_billing_customers")
    .upsert(
      {
        device_id: deviceId,
        stripe_customer_id: customer.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" }
    );

  if (uErr) throw new Error(`db_error:${uErr.message}`);

  return customer.id;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const deviceId = pickDeviceId(req, body);

    if (!deviceId) {
      return NextResponse.json(
        { error: "device_id_missing" },
        { status: 400 }
      );
    }

    if (body.kind !== "slots" && body.kind !== "topic_plan") {
      return NextResponse.json(
        { error: "kind_missing" },
        { status: 400 }
      );
    }

    const customerId = await ensureCustomerId(deviceId);
    const priceId = priceIdFor(body as Body);

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const success_url = `${origin}/class/select?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${origin}/class/select?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url,
      cancel_url,

      metadata: {
        deviceId: deviceId,
        kind: (body as Body).kind,
      },
    });

    return NextResponse.json({
      url: session.url,
      customerId,
      priceId,
    });
  } catch (e: any) {
    console.error("[create-checkout-session] error", e);

    return NextResponse.json(
      { error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}