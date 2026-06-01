import { NextResponse } from "next/server";
import {
  markClassMessagesRead,
  normalizeReadClassId,
  normalizeReadDeviceId,
} from "@/lib/classMessageReads";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = normalizeReadDeviceId(body?.device_id ?? body?.deviceId);
    const classId = normalizeReadClassId(body?.class_id ?? body?.classId);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 401 }
      );
    }

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "class_id_missing" },
        { status: 400 }
      );
    }

    const result = await markClassMessagesRead(deviceId, classId);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      last_read_at: result.last_read_at,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: message },
      { status: 500 }
    );
  }
}
