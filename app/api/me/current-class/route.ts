import { NextResponse } from "next/server";
import { resolveApiActor } from "@/lib/actorIdentity";
import { resolveCurrentClassForActor } from "@/lib/resolveCurrentClass";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function readDeviceId(req: Request) {
  const url = new URL(req.url);
  return (
    url.searchParams.get("deviceId") ||
    url.searchParams.get("device_id") ||
    req.headers.get("x-device-id") ||
    ""
  );
}

export async function GET(req: Request) {
  try {
    const deviceId = readDeviceId(req);
    const normalizedDeviceId = String(deviceId).trim();

    if (!normalizedDeviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    const actorResult = await resolveApiActor({
      req,
      deviceId: normalizedDeviceId,
    });

    if (!actorResult.ok) {
      return NextResponse.json(
        { ok: false, error: actorResult.error, message: actorResult.message },
        { status: actorResult.status }
      );
    }

    const resolved = await resolveCurrentClassForActor(
      supabaseAdmin,
      {
        deviceId: normalizedDeviceId,
        userId: actorResult.actor.userId || null,
      }
    );

    if (!resolved.ok) {
      return NextResponse.json(
        { ok: false, error: "current_class_failed", detail: resolved.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      hasMembership: Boolean(resolved.current),
      current: resolved.current,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "current_class_error";
    console.error("[api/me/current-class]", message);
    return NextResponse.json(
      { ok: false, error: "current_class_error", detail: message },
      { status: 500 }
    );
  }
}
