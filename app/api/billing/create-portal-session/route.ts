import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createBillingPortalSession,
  portalConfigEnvForAction,
  type PortalAction,
} from "@/lib/stripePortal";

export const runtime = "nodejs";

const PORTAL_ACTIONS: PortalAction[] = [
  "update_theme",
  "update_slots",
  "cancel_theme",
  "cancel_slots",
];

function originFromEnv() {
  return (
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body.deviceId ?? "").trim();
    const dev = String(body.dev ?? "").trim();
    const action = String(body.action ?? "").trim() as PortalAction;

    if (!PORTAL_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "invalid_portal_action" }, { status: 400 });
    }

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId_required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("user_billing_customers")
      .select("stripe_customer_id")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) {
      console.error("read user_billing_customers error:", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    if (!data?.stripe_customer_id) {
      return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
    }

    const origin = originFromEnv();
    const returnUrl = dev
      ? `${origin}/billing?dev=${encodeURIComponent(dev)}`
      : `${origin}/billing`;

    const portalRes = await createBillingPortalSession({
      customerId: data.stripe_customer_id,
      returnUrl,
      action,
    });

    if (!portalRes.ok) {
      const status = portalRes.error.startsWith("subscription_not_found")
        ? 404
        : portalRes.error.startsWith("portal_configuration_missing") ||
            portalRes.error.startsWith("portal_configuration_invalid")
          ? 503
          : 500;

      const configEnv = portalConfigEnvForAction(action);

      console.error("[billing/create-portal-session] failed", {
        deviceId,
        action,
        error: portalRes.error,
        configEnv,
        configConfigured: Boolean(String(process.env[configEnv] ?? "").trim()),
      });

      return NextResponse.json({ error: portalRes.error }, { status });
    }

    console.log("[billing/create-portal-session] ok", {
      deviceId,
      action,
      configuration: portalRes.configuration,
    });

    return NextResponse.json({ url: portalRes.url });
  } catch (e: unknown) {
    console.error("create portal session error:", e);

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
