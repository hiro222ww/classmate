import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { diagnoseClassRepair } from "@/lib/adminClassRepair";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId") ?? "";
  const sessionId = searchParams.get("sessionId") ?? "";
  const deviceId = searchParams.get("deviceId") ?? "";

  const result = await diagnoseClassRepair({ classId, sessionId, deviceId });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({ ok: true, diagnose: result });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const result = await diagnoseClassRepair({
    classId: body.classId,
    sessionId: body.sessionId,
    deviceId: body.deviceId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({ ok: true, diagnose: result });
}
