import { NextResponse } from "next/server";
import { getExperiencePublicStatus } from "@/lib/experience/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getExperiencePublicStatus();
    return NextResponse.json(status);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "status_failed", detail: message },
      { status: 500 }
    );
  }
}
