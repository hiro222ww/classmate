import { NextResponse } from "next/server";
import {
  hasLinkedEmailFromAuthUser,
  pickDeviceIdFromRequest,
} from "@/lib/userIdentity";
import { verifySupabaseAccessToken } from "@/lib/requestIdentity";
import { bootstrapUserIdentity } from "@/lib/userIdentityMigration";
import {
  assertDeviceBootstrapAllowed,
  DeviceOwnershipError,
} from "@/lib/deviceOwnership";
import { logAuthRestore } from "@/lib/authRestoreLog";
import { lookupEntitlements } from "@/lib/userIdentityMigration";
import { buildLoginUrl } from "@/lib/authAccount";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = pickDeviceIdFromRequest(req, body?.deviceId);
    const token =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
      String(body?.accessToken ?? "").trim();

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_required" },
        { status: 400 }
      );
    }

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "access_token_required" },
        { status: 401 }
      );
    }

    const verified = await verifySupabaseAccessToken(token);
    if (!verified.user) {
      return NextResponse.json(
        { ok: false, error: verified.error ?? "invalid_access_token" },
        { status: 401 }
      );
    }

    const userId = verified.user.id;
    const hasLinkedEmail = hasLinkedEmailFromAuthUser(verified.user);

    let deviceSecretHash: string | null = null;
    let reregisteredDevice = false;
    try {
      const ownership = await assertDeviceBootstrapAllowed({
        req,
        userId,
        deviceId,
        bodySecret: body?.deviceSecret,
        hasLinkedEmail,
        allowSecretReregistration: body?.reregisterDevice === true,
      });
      deviceSecretHash = ownership.deviceSecretHash;
      reregisteredDevice = ownership.reregisteredDevice === true;
    } catch (error) {
      if (error instanceof DeviceOwnershipError) {
        logAuthRestore({
          phase: "session_bootstrap_denied",
          userId,
          deviceId,
          email: verified.user.email ?? null,
          linked: hasLinkedEmail,
          anonymous: Boolean(verified.user.is_anonymous),
          error: error.code,
        });

        return NextResponse.json(
          {
            ok: false,
            error: error.code,
            message: error.message,
            action: error.action ?? null,
            redirectTo:
              error.action === "restore_login"
                ? buildLoginUrl("/home")
                : error.action === "needs_profile" ||
                    error.code === "profile_device_conflict"
                  ? "/profile"
                  : null,
          },
          { status: 403 }
        );
      }
      throw error;
    }

    const bootstrap = await bootstrapUserIdentity({
      userId,
      deviceId,
      deviceSecretHash,
    });

    logAuthRestore({
      phase: reregisteredDevice ? "session_reregistered" : "session_bootstrapped",
      userId,
      deviceId,
      email: verified.user.email ?? null,
      linked: hasLinkedEmail,
      anonymous: Boolean(verified.user.is_anonymous),
      profileMigrated: bootstrap.profileMigrated,
      entitlementsLinked: bootstrap.entitlementsLinked,
      billingLinked: bootstrap.billingLinked,
      matchPrefsLinked: bootstrap.matchPrefsLinked,
    });

    return NextResponse.json({
      ok: true,
      userId,
      deviceId,
      isAnonymous: Boolean(verified.user.is_anonymous),
      hasLinkedEmail,
      email: verified.user.email ?? null,
      reregisteredDevice,
      ...bootstrap,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "session_bootstrap_failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const deviceId = pickDeviceIdFromRequest(req);
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "access_token_required" },
        { status: 401 }
      );
    }

    const verified = await verifySupabaseAccessToken(token);
    if (!verified.user) {
      return NextResponse.json(
        { ok: false, error: verified.error ?? "invalid_access_token" },
        { status: 401 }
      );
    }

    const userId = verified.user.id;
    const hasLinkedEmail = hasLinkedEmailFromAuthUser(verified.user);
    const entitlements = await lookupEntitlements({
      userId,
      deviceId: deviceId || null,
    });

    return NextResponse.json({
      ok: true,
      userId,
      deviceId: deviceId || null,
      isAnonymous: Boolean(verified.user.is_anonymous),
      hasLinkedEmail,
      email: verified.user.email ?? null,
      entitlements: entitlements
        ? {
            plan: entitlements.plan,
            class_slots: entitlements.class_slots,
            can_create_classes: entitlements.can_create_classes,
            topic_plan: entitlements.topic_plan,
            theme_pass: entitlements.theme_pass,
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "auth_status_failed" },
      { status: 500 }
    );
  }
}
