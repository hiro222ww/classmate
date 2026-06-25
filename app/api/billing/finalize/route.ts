import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { computeEntitlementsFromSubscriptions } from "@/lib/billingCatalog";
import { resolveRequestIdentity } from "@/lib/requestIdentity";
import { assertBillingAccountLinked } from "@/lib/billingAuthGate";
import {
  syncEntitlementsForStripeCustomer,
  upsertBillingCustomerRecord,
  upsertEntitlementsFromResolved,
} from "@/lib/billingIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickDeviceId(req: Request) {
  return String(req.headers.get("x-device-id") ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const deviceId = pickDeviceId(req);

    if (!deviceId) {
      return NextResponse.json({ error: "missing_x_device_id" }, { status: 400 });
    }

    const identityResult = await resolveRequestIdentity({
      req,
      deviceId,
      requireAuth: true,
    });

    if (!identityResult.ok) {
      return NextResponse.json(
        { error: identityResult.error, message: identityResult.message },
        { status: identityResult.status }
      );
    }

    const billingGate = assertBillingAccountLinked(
      identityResult.identity,
      "/premium"
    );
    if (!billingGate.ok) {
      return NextResponse.json(
        {
          error: billingGate.error,
          message: billingGate.message,
          redirectTo: billingGate.redirectTo,
        },
        { status: billingGate.status }
      );
    }

    const { userId } = identityResult.identity;

    const body = await req.json().catch(() => ({}));
    const session_id = body?.session_id;

    if (!session_id || typeof session_id !== "string") {
      return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription", "subscription.items.data.price"],
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          error: "payment_not_completed",
          payment_status: session.payment_status,
        },
        { status: 402 }
      );
    }

    const sessionUserId = String(session.metadata?.user_id ?? "").trim();
    const sessionDeviceId = String(session.metadata?.device_id ?? "").trim();
    const referenceUserId = String(session.client_reference_id ?? "").trim();

    const userMatches =
      referenceUserId === userId ||
      sessionUserId === userId ||
      referenceUserId === deviceId;

    const deviceMatches =
      !sessionDeviceId || sessionDeviceId === deviceId;

    if (!userMatches || !deviceMatches) {
      return NextResponse.json(
        {
          error: "checkout_identity_mismatch",
          session_user_id: sessionUserId || referenceUserId || null,
          session_device_id: sessionDeviceId || null,
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

    await upsertBillingCustomerRecord({
      userId,
      deviceId,
      stripeCustomerId: customerId,
    });

    const synced = await syncEntitlementsForStripeCustomer(customerId);
    if (!synced) {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
        expand: ["data.items.data.price"],
      });

      const activeSubs = subs.data.filter(
        (s) => s.status === "active" || s.status === "trialing"
      );

      const resolved = computeEntitlementsFromSubscriptions(activeSubs);
      const hasKnownPrice = resolved.topic_plan > 0 || resolved.class_slots > 1;

      if (!hasKnownPrice) {
        return NextResponse.json(
          { error: "price_mapping_not_found" },
          { status: 409 }
        );
      }

      await upsertEntitlementsFromResolved({
        userId,
        deviceId,
        resolved,
      });
    }

    return NextResponse.json({
      ok: true,
      userId,
      deviceId,
      customerId,
    });
  } catch (e: any) {
    console.error("[billing/finalize] fatal", e);

    return NextResponse.json(
      { error: e?.message ?? "finalize_failed" },
      { status: 500 }
    );
  }
}
