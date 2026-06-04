import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { repairClassMembership } from "@/lib/adminClassRepair";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  if (body.confirm !== true) {
    return NextResponse.json(
      { ok: false, error: "confirm_required" },
      { status: 400 }
    );
  }

  const result = await repairClassMembership({
    classId: body.classId,
    sessionId: body.sessionId,
    deviceId: body.deviceId,
  });

  if (!result.ok) {
    const status =
      result.error === "class_not_found" ||
      result.error === "session_not_found" ||
      result.error === "session_class_mismatch"
        ? 404
        : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({
    ok: true,
    repair: result,
  });
}
