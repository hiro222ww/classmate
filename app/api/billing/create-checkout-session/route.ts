import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type Stripe from "stripe";

type SlotsBody = {
  deviceId: string;
  kind: "slots";
  slotsTotal: 3 | 5;
  dev?: string;
};

type TopicPlanBody = {
  deviceId: string;
  kind: "topic_plan";
  amount: 400 | 800 | 1200;
  dev?: string;
};

type Body = SlotsBody | TopicPlanBody;
type Category = "slots" | "topic_plan";

function pickDeviceId(req: Request, body: unknown) {
  const b = (body ?? {}) as Partial<Body>;
  return req.headers.get("x-device-id") || b.deviceId || "";
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name}_missing`);
  return v;
}

function normalizeDev(v: unknown) {
  return String(v ?? "").trim();
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

function categoryFor(body: Body): Category {
  return body.kind === "slots" ? "slots" : "topic_plan";
}

function targetRank(body: Body) {
  return body.kind === "slots" ? body.slotsTotal : body.amount;
}

function topicPriceMap() {
  return new Map<string, number>([
    [process.env.STRIPE_PRICE_TOPIC_400 ?? "", 400],
    [process.env.STRIPE_PRICE_TOPIC_800 ?? "", 800],
    [process.env.STRIPE_PRICE_TOPIC_1200 ?? "", 1200],
  ]);
}

function slotsPriceMap() {
  return new Map<string, number>([
    [process.env.STRIPE_PRICE_SLOTS_3 ?? "", 3],
    [process.env.STRIPE_PRICE_SLOTS_5 ?? "", 5],
  ]);
}

function priceRankForCategory(priceId: string, category: Category) {
  const map = category === "topic_plan" ? topicPriceMap() : slotsPriceMap();
  return map.get(priceId) ?? 0;
}

function portalConfigForCategory(category: Category) {
  if (category === "slots") return mustEnv("STRIPE_PORTAL_CONFIG_SLOTS");
  return mustEnv("STRIPE_PORTAL_CONFIG_THEME");
}

async function getCustomerIdByDeviceId(deviceId: string) {
  const { data } = await supabaseAdmin
    .from("user_billing_customers")
    .select("stripe_customer_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  return String(data?.stripe_customer_id ?? "").trim() || null;
}

async function findActiveSubscriptionItem(params: {
  customerId: string;
  category: Category;
}) {
  const { customerId, category } = params;

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  });

  const activeSubs = subs.data.filter(
    (s) => s.status === "active" || s.status === "trialing"
  );

  let best: {
    subscription: Stripe.Subscription;
    item: Stripe.SubscriptionItem;
    priceId: string;
    rank: number;
  } | null = null;

  for (const sub of activeSubs) {
    for (const item of sub.items.data) {
      const priceId = item.price?.id;
      if (!priceId) continue;

      const rank = priceRankForCategory(priceId, category);
      if (rank <= 0) continue;

      if (!best || rank > best.rank) {
        best = { subscription: sub, item, priceId, rank };
      }
    }
  }

  return best;
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

function buildPortalReturnUrl(origin: string, dev: string) {
  const p = new URLSearchParams();
  p.set("upgraded", "1");
  if (dev) p.set("dev", dev);

  return `${origin}/class/select?${p.toString()}`;
}

export async function POST(req: Request) {
  try {
    const rawBody = (await req.json().catch(() => ({}))) as Partial<Body>;
    const deviceId = pickDeviceId(req, rawBody).trim();
    const dev = normalizeDev(rawBody.dev);

    if (!deviceId) {
      return NextResponse.json({ error: "device_id_missing" }, { status: 400 });
    }

    let body: Body;

    if (isSlotsBody(rawBody)) {
      body = rawBody;
    } else if (isTopicPlanBody(rawBody)) {
      body = rawBody;
    } else {
      return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
    }

    const priceId = priceIdFor(body);
    const category = categoryFor(body);
    const nextRank = targetRank(body);

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const success_url = buildSuccessUrl(origin, dev);
    const cancel_url = buildCancelUrl(origin, dev);
    const portalReturnUrl = buildPortalReturnUrl(origin, dev);

    const metadata: Stripe.MetadataParam =
      body.kind === "slots"
        ? {
            deviceId,
            dev,
            kind: "slots",
            slotsTotal: String(body.slotsTotal),
          }
        : {
            deviceId,
            dev,
            kind: "topic_plan",
            amount: String(body.amount),
          };

    const customerId = await getCustomerIdByDeviceId(deviceId);

    // 同カテゴリの既存契約がある場合は、CheckoutではなくPortalへ
    if (customerId) {
      const existing = await findActiveSubscriptionItem({
        customerId,
        category,
      });

      if (existing) {
        if (nextRank <= existing.rank) {
          return NextResponse.json(
            { error: "downgrade_or_same_plan_not_allowed" },
            { status: 400 }
          );
        }

        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: portalReturnUrl,
          configuration: portalConfigForCategory(category),
        });

        return NextResponse.json({
          ok: true,
          portal: true,
          url: portal.url,
        });
      }
    }

    // 新規契約 or 別カテゴリ追加はCheckoutへ
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
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
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}