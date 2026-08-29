import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySupabaseAccessToken } from "@/lib/requestIdentity";
import { isValidDeviceUuid } from "@/lib/deviceIdValidation";
import { isFunnelEventName } from "@/lib/funnelEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function ok(body: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...body });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const eventName = String(body?.eventName ?? body?.event_name ?? "").trim();
    if (!isFunnelEventName(eventName)) {
      return NextResponse.json(
        { ok: false, error: "invalid_event_name" },
        { status: 400 }
      );
    }

    const deviceRaw = String(body?.deviceId ?? body?.device_id ?? "").trim();
    const deviceId = isValidDeviceUuid(deviceRaw) ? deviceRaw : null;

    const sessionRaw = String(body?.sessionId ?? body?.session_id ?? "").trim();
    const sessionId = isUuid(sessionRaw) ? sessionRaw : null;

    const classRaw = String(body?.classId ?? body?.class_id ?? "").trim();
    const classId = isUuid(classRaw) ? classRaw : null;

    let userId: string | null = null;
    const authHeader = req.headers.get("authorization") ?? "";
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (tokenMatch?.[1]) {
      const verified = await verifySupabaseAccessToken(tokenMatch[1]);
      if (verified.user?.id) {
        userId = verified.user.id;
      }
    }

    let meta: Record<string, unknown> = {};
    if (body?.meta && typeof body.meta === "object" && !Array.isArray(body.meta)) {
      meta = body.meta as Record<string, unknown>;
    }

    const { error } = await supabaseAdmin.from("product_funnel_events").insert({
      event_name: eventName,
      device_id: deviceId,
      user_id: userId,
      session_id: sessionId,
      class_id: classId,
      meta,
    });

    if (error) {
      console.warn("[funnel-event] insert failed", error.message);
      return ok({ skipped: "insert_failed" });
    }

    return ok({ recorded: true });
  } catch (e) {
    console.warn("[funnel-event] unexpected", e);
    return ok({ skipped: "error" });
  }
}
