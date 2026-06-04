import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { repairClassMembership } from "@/lib/adminClassRepair";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun === true;

  if (!dryRun && body.confirm !== true) {
    return NextResponse.json(
      { ok: false, error: "confirm_required" },
      { status: 400 }
    );
  }

  const result = await repairClassMembership({
    classId: body.classId,
    sessionId: body.sessionId,
    deviceId: body.deviceId,
    dryRun,
  });

  if (!result.ok) {
    const status =
      result.error === "class_not_found" ||
      result.error === "session_not_found" ||
      result.error === "session_class_mismatch"
        ? 409
        : 400;
    return NextResponse.json(result, { status });
  }

  const httpStatus = result.status === "partial" ? 207 : 200;

  return NextResponse.json(
    {
      ok: true,
      repair: result,
    },
    { status: httpStatus }
  );
}
