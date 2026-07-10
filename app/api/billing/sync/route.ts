import { NextResponse } from "next/server";
import { resolveApiActor } from "@/lib/actorIdentity";
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

    const actorResult = await resolveApiActor({ req, deviceId });
    if (!actorResult.ok) {
      return NextResponse.json(
        { ok: false, error: actorResult.error, message: actorResult.message },
        { status: actorResult.status }
      );
    }

    const userId = actorResult.actor.userId || null;
    const actorDeviceId = actorResult.actor.deviceId;

    let currentEnt = null;
    try {
      currentEnt = await lookupEntitlements({
        userId,
        deviceId: actorDeviceId,
      });
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
      deviceId: actorDeviceId,
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

    const ent = await lookupEntitlements({
      userId,
      deviceId: actorDeviceId,
    });

    return NextResponse.json({
      ok: true,
      deviceId: actorDeviceId,
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