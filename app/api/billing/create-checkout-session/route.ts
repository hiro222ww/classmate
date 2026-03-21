import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type Stripe from "stripe";

type SlotsBody = {
  deviceId: string;
  kind: "slots";
  slotsTotal: 3 | 5;
};

type TopicPlanBody = {
  deviceId: string;
  kind: "topic_plan";
  amount: 400 | 800 | 1200;
};

type Body = SlotsBody | TopicPlanBody;

function pickDeviceId(req: Request, body: unknown) {
  const b = (body ?? {}) as Partial<Body>;
  return req.headers.get("x-device-id") || b.deviceId || "";
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name}_missing`);
  return v;
}

function isSlotsBody(body: Partial<Body>): body is SlotsBody {
  return (
    body.kind === "slots" &&
    (body.slotsTotal === 3 || body.slotsTotal === 5) &&
    typeof body.deviceId === "string"
  );
}

function isTopicPlanBody(body: Partial<Body>): body is TopicPlanBody {
  return (
    body.kind === "topic_plan" &&
    (body.amount === 400 || body.amount === 800 || body.amount === 1200) &&
    typeof body.deviceId === "string"
  );
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

async function findProfileEmail(deviceId: string): Promise<string | undefined> {
  try {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select("email")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) {
      console.warn(
        "[create-checkout-session] user_profiles lookup failed:",
        error.message
      );
      return undefined;
    }

    const email = String((data as { email?: string } | null)?.email ?? "").trim();
    if (!email || !email.includes("@")) return undefined;
    return email;
  } catch (e) {
    console.warn("[create-checkout-session] profile email lookup exception:", e);
    return undefined;
  }
}

export async function POST(req: Request) {
  try {
    const rawBody = (await req.json().catch(() => ({}))) as Partial<Body>;
    const deviceId = pickDeviceId(req, rawBody);

    if (!deviceId) {
      return NextResponse.json(
        { error: "device_id_missing" },
        { status: 400 }
      );
    }

    let body: Body;

    if (isSlotsBody(rawBody)) {
      body = rawBody;
    } else if (isTopicPlanBody(rawBody)) {
      body = rawBody;
    } else {
      return NextResponse.json(
        { error: "invalid_request_body" },
        { status: 400 }
      );
    }

    const priceId = priceIdFor(body);
    const email = await findProfileEmail(deviceId);

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const success_url = `${origin}/class/select?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${origin}/class/select?canceled=1`;

    let metadata: Stripe.MetadataParam;
    if (body.kind === "slots") {
      metadata = {
        deviceId,
        kind: "slots",
        slotsTotal: String(body.slotsTotal),
      };
    } else {
      metadata = {
        deviceId,
        kind: "topic_plan",
        amount: String(body.amount),
      };
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url,
      cancel_url,
      client_reference_id: deviceId,
      metadata,
      ...(email ? { customer_email: email } : {}),
    };

    const session = await stripe.checkout.sessions.create(params);

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
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