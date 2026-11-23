import { NextResponse } from "next/server";
import { leaveExperienceEvent } from "@/lib/experience/join";
import { isJoinAllowedDeviceId } from "@/lib/deviceIdValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.sessionId ?? body?.session_id ?? "").trim();
    const deviceId = String(body?.deviceId ?? body?.device_id ?? "").trim();
    const eventId = String(body?.eventId ?? body?.event_id ?? "").trim();

    if (!sessionId || !isJoinAllowedDeviceId(deviceId)) {
      return NextResponse.json(
        { ok: false, error: "missing_session_or_device" },
        { status: 400 }
      );
    }

    const result = await leaveExperienceEvent({
      eventId: eventId || null,
      sessionId,
      deviceId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "leave_failed", detail: message },
      { status: 500 }
    );
  }
}
