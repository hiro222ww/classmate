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

    let deviceSecretHash: string | null = null;
    try {
      const ownership = await assertDeviceBootstrapAllowed({
        req,
        userId,
        deviceId,
        bodySecret: body?.deviceSecret,
      });
      deviceSecretHash = ownership.deviceSecretHash;
    } catch (error) {
      if (error instanceof DeviceOwnershipError) {
        return NextResponse.json(
          { ok: false, error: error.code, message: error.message },
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

    return NextResponse.json({
      ok: true,
      userId,
      deviceId,
      isAnonymous: Boolean(verified.user.is_anonymous),
      hasLinkedEmail: hasLinkedEmailFromAuthUser(verified.user),
      email: verified.user.email ?? null,
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

    return NextResponse.json({
      ok: true,
      userId: verified.user.id,
      deviceId: deviceId || null,
      isAnonymous: Boolean(verified.user.is_anonymous),
      hasLinkedEmail: hasLinkedEmailFromAuthUser(verified.user),
      email: verified.user.email ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "auth_status_failed" },
      { status: 500 }
    );
  }
}
