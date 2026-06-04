import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { diagnoseSessionSummary } from "@/lib/adminClassRepair";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const classId = String(searchParams.get("classId") ?? "").trim();
  const sessionId = String(searchParams.get("sessionId") ?? "").trim();

  if (!classId || !isUuid(classId) || !sessionId || !isUuid(sessionId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_params" },
      { status: 400 }
    );
  }

  const summary = await diagnoseSessionSummary(sessionId, classId);

  if (!summary) {
    return NextResponse.json(
      { ok: false, error: "summary_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, summary });
}
