import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { resolveRequestIdentity } from "@/lib/requestIdentity";
import { assertBillingAccountLinked } from "@/lib/billingAuthGate";
import { resolveBillingCustomer } from "@/lib/billingIdentity";
import { resolveAppOrigin } from "@/lib/appOrigin";
import {
  createBillingPortalSession,
  type PortalAction,
} from "@/lib/stripePortal";

export const runtime = "nodejs";

const PORTAL_ACTIONS = new Set<PortalAction>([
  "update_theme",
  "update_slots",
  "cancel_theme",
  "cancel_slots",
]);

function normalizePortalAction(body: Record<string, unknown>): PortalAction | null {
  const action = String(body.action ?? "").trim();
  if (PORTAL_ACTIONS.has(action as PortalAction)) {
    return action as PortalAction;
  }

  const kind = String(body.kind ?? "").trim();
  if (kind === "theme") return "update_theme";
  if (kind === "slot" || kind === "slots") return "update_slots";

  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const deviceId = String(body.deviceId ?? req.headers.get("x-device-id") ?? "").trim();
    const dev = String(body.dev ?? "").trim();

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId_required" }, { status: 400 });
    }

    const identityResult = await resolveRequestIdentity({
      req,
      deviceId,
      requireAuth: true,
    });

    if (!identityResult.ok) {
      return NextResponse.json(
        {
          error: identityResult.error,
          message: identityResult.message,
          redirectTo: "/login",
        },
        { status: identityResult.status }
      );
    }

    const billingGate = assertBillingAccountLinked(identityResult.identity);
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

    const action = normalizePortalAction(body);
    if (!action) {
      return NextResponse.json({ error: "invalid_portal_action" }, { status: 400 });
    }

    const customer = await resolveBillingCustomer({
      userId: identityResult.identity.userId,
      deviceId,
    });

    if (!customer?.stripe_customer_id) {
      return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
    }

    const origin = resolveAppOrigin();
    const returnUrl = dev
      ? `${origin}/billing?dev=${encodeURIComponent(dev)}`
      : `${origin}/billing`;

    const result = await createBillingPortalSession({
      customerId: customer.stripe_customer_id,
      returnUrl,
      action,
    });

    if (!result.ok) {
      const status = result.error.startsWith("subscription_not_found") ? 404 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ url: result.url });
  } catch (e: unknown) {
    console.error(
      "[billing] create portal session failed",
      e instanceof Error ? e.message : "unknown"
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
