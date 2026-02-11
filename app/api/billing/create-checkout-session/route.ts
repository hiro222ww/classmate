// app/api/billing/create-checkout-session/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body =
  | { deviceId: string; kind: "slots"; slotsTotal: 3 | 5 }
  | { deviceId: string; kind: "topic_plan"; amount: 400 | 800 | 1200 };

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const PRICE_SLOTS_3 = () => mustEnv("STRIPE_PRICE_SLOTS_3"); // price_...
const PRICE_SLOTS_5 = () => mustEnv("STRIPE_PRICE_SLOTS_5"); // price_...
const PRICE_TOPIC_400 = () => mustEnv("STRIPE_PRICE_TOPIC_400"); // price_...
const PRICE_TOPIC_800 = () => mustEnv("STRIPE_PRICE_TOPIC_800"); // price_...
const PRICE_TOPIC_1200 = () => mustEnv("STRIPE_PRICE_TOPIC_1200"); // price_...

async function getOrCreateCustomerId(deviceId: string): Promise<string> {
  // 既存紐付け
  const { data: row, error } = await supabaseAdmin
    .from("user_billing_customers")
    .select("stripe_customer_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) throw error;
  if (row?.stripe_customer_id) return row.stripe_customer_id;

  // 新規customer作成（deviceIdをmetadataに）
  const customer = await stripe.customers.create({
    metadata: { deviceId },
  });

  // DB保存
  const { error: upErr } = await supabaseAdmin
    .from("user_billing_customers")
    .upsert({ device_id: deviceId, stripe_customer_id: customer.id }, { onConflict: "device_id" });

  if (upErr) throw upErr;
  return customer.id;
}

async function getCurrentEntitlements(deviceId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_entitlements")
    .select("class_slots, topic_plan, theme_pass")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) throw error;

  const classSlots = Number(data?.class_slots ?? 1);
  const topicPlan = typeof data?.topic_plan === "number"
    ? data.topic_plan
    : data?.theme_pass
      ? 1200
      : 0;

  return { classSlots, topicPlan };
}

function priceIdFor(body: Body): string {
  if (body.kind === "slots") {
    return body.slotsTotal === 3 ? PRICE_SLOTS_3() : PRICE_SLOTS_5();
  }
  // topic_plan
  if (body.amount === 400) return PRICE_TOPIC_400();
  if (body.amount === 800) return PRICE_TOPIC_800();
  return PRICE_TOPIC_1200();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!body?.deviceId) {
      return NextResponse.json({ error: "missing_deviceId" }, { status: 400 });
    }
    if (body.kind !== "slots" && body.kind !== "topic_plan") {
      return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    }

    // ✅ 逆方向（ダウングレード）防止：希望ならここで弾く
    const ent = await getCurrentEntitlements(body.deviceId);
    if (body.kind === "slots") {
      if (body.slotsTotal <= ent.classSlots) {
        return NextResponse.json({ error: "already_has_equal_or_higher_slots" }, { status: 400 });
      }
    } else {
      if (body.amount <= ent.topicPlan) {
        return NextResponse.json({ error: "already_has_equal_or_higher_topic_plan" }, { status: 400 });
      }
    }

    const customerId = await getOrCreateCustomerId(body.deviceId);
    const priceId = priceIdFor(body);

    // 成功/キャンセル戻り先
    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_ORIGIN ??
      "http://localhost:3000";

    // 🔥 重要：metadataに deviceId / kind / amount を入れる（Webhookで確実に拾う）
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/class/select?billing=success`,
      cancel_url: `${origin}/class/select?billing=cancel`,
      metadata: {
        deviceId: body.deviceId,
        kind: body.kind,
        ...(body.kind === "slots" ? { slotsTotal: String(body.slotsTotal) } : { amount: String(body.amount) }),
      },
      subscription_data: {
        metadata: {
          deviceId: body.deviceId,
          kind: body.kind,
        },
        // 後述：月途中の変更の扱い。まずはStripe標準の「日割り調整（クレジット）」が一番自然
        proration_behavior: "create_prorations",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("create-checkout-session error:", e);
    return NextResponse.json({ error: e?.message ?? "server_error" }, { status: 500 });
  }
}
