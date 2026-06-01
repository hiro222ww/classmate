import { NextResponse } from "next/server";
import { fetchNotificationFeedEvents } from "@/lib/notificationFeed";
import { normalizeMeetingDeviceId } from "@/lib/meetingPlan";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = normalizeMeetingDeviceId(
      searchParams.get("device_id") ?? searchParams.get("deviceId")
    );
    const since = searchParams.get("since");
    const limit = searchParams.get("limit");

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 401 }
      );
    }

    const result = await fetchNotificationFeedEvents({
      deviceId,
      since,
      limit: limit ? Number(limit) : 20,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          detail: "detail" in result ? result.detail : undefined,
        },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      events: result.events,
      cursor: result.cursor,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: message },
      { status: 500 }
    );
  }
}
