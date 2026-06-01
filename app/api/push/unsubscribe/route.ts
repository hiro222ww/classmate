import { NextResponse } from "next/server";
import { deletePushSubscriptionByEndpoint } from "@/lib/pushSubscriptions";
import { normalizeMeetingDeviceId } from "@/lib/meetingPlan";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = normalizeMeetingDeviceId(body?.device_id ?? body?.deviceId);
    const endpoint = String(body?.endpoint ?? "").trim();

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 401 }
      );
    }

    if (!endpoint) {
      return NextResponse.json(
        { ok: false, error: "endpoint_missing" },
        { status: 400 }
      );
    }

    const result = await deletePushSubscriptionByEndpoint(endpoint);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: message },
      { status: 500 }
    );
  }
}
