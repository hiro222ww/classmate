// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function resolveTopicPlan(priceIds: string[]) {
  const map: Record<string, number> = {
    [process.env.STRIPE_PRICE_TOPIC_400 ?? ""]: 400,
    [process.env.STRIPE_PRICE_TOPIC_800 ?? ""]: 800,
    [process.env.STRIPE_PRICE_TOPIC_1200 ?? ""]: 1200,
  };
  let best = 0;
  for (const id of priceIds) best = Math.max(best, map[id] ?? 0);
  return best;
}

function resolveClassSlots(priceIds: string[]) {
  const map: Record<string, number> = {
    [process.env.STRIPE_PRICE_SLOTS_1 ?? ""]: 1,
    [process.env.STRIPE_PRICE_SLOTS_3 ?? ""]: 3,
    [process.env.STRIPE_PRICE_SLOTS_5 ?? ""]: 5,
  };
  let best = 0;
  for (const id of priceIds) best = Math.max(best, map[id] ?? 0);
  return best;
}

export async function POST(req: Request) {
  try {
    const sig = req.headers.get("stripe-signature");
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !whsec) {
      return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET or signature" }, { status: 400 });
    }

    const raw = await req.text();
    const event = stripe.webhooks.constructEvent(raw, sig, whsec);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const deviceId = session?.metadata?.deviceId as string | undefined;
      const customerId = session?.customer as string | undefined;

      console.log("[webhook] checkout.session.completed", { deviceId, customerId });

      if (deviceId && customerId) {
        await supabaseAdmin
          .from("user_billing_customers")
          .upsert(
            { device_id: deviceId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
            { onConflict: "device_id" }
          );
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub = event.data.object as any;
      const customerId = sub?.customer as string | undefined;

      if (customerId) {
        const { data: rows, error } = await supabaseAdmin
          .from("user_billing_customers")
          .select("device_id")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (error) throw error;

        const deviceId = rows?.[0]?.device_id;
        const priceIds: string[] =
          sub?.items?.data?.map((it: any) => it?.price?.id).filter(Boolean) ?? [];

        console.log("[webhook] subscription", { customerId, deviceId, priceIds });

        if (deviceId) {
          const topic_plan = resolveTopicPlan(priceIds);
          const class_slots = resolveClassSlots(priceIds);

          await supabaseAdmin
            .from("user_entitlements")
            .upsert(
              { device_id: deviceId, topic_plan, class_slots, updated_at: new Date().toISOString() },
              { onConflict: "device_id" }
            );
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("[webhook] error", e);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 400 });
  }
}