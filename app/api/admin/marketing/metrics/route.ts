import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { loadMarketingDashboardMetrics } from "@/lib/marketing/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const rangeDays = Number(searchParams.get("days") ?? 14) || 14;
    const result = await loadMarketingDashboardMetrics({ rangeDays });
    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json({ ok: true, metrics: result.metrics });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "metrics_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
