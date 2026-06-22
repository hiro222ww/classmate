import { NextResponse } from "next/server";
import { resolveRequestIdentity } from "@/lib/requestIdentity";
import { lookupEntitlements } from "@/lib/userIdentityMigration";
import { resolveBillingCustomer, syncEntitlementsForStripeCustomer } from "@/lib/billingIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickDeviceId(req: Request, body: { deviceId?: string }) {
  return req.headers.get("x-device-id") || body?.deviceId || "";
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

    const customer = await resolveBillingCustomer({
      userId,
      deviceId,
    });
    const customerId = customer?.stripe_customer_id ?? null;

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "billing_customer_missing", deviceId, userId },
        { status: 404 }
      );
    }

    const synced = await syncEntitlementsForStripeCustomer(customerId);
    if (!synced) {
      return NextResponse.json(
        { ok: false, error: "billing_sync_failed", deviceId, userId },
        { status: 500 }
      );
    }

    const ent = await lookupEntitlements({ userId, deviceId });

    return NextResponse.json({
      ok: true,
      deviceId,
      userId,
      customerId,
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