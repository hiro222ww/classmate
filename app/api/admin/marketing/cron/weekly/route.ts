import { NextResponse } from "next/server";
import {
  getMarketingCronSecret,
  isMarketingWeeklyCronEnabled,
} from "@/lib/marketing/config";
import { runWeeklyMarketingAnalysis } from "@/lib/marketing/weeklyReport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Weekly analysis cron hook.
 * Disabled unless MARKETING_WEEKLY_CRON_ENABLED=1.
 * Creates report + draft strategy; does NOT activate strategy or publish SNS.
 */
export async function POST(req: Request) {
  if (!isMarketingWeeklyCronEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "weekly_cron_disabled",
        detail: "Set MARKETING_WEEKLY_CRON_ENABLED=1 after operator approval.",
      },
      { status: 403 }
    );
  }

  const secret = getMarketingCronSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "cron_secret_missing" },
      { status: 500 }
    );
  }

  const header = req.headers.get("authorization") || "";
  const provided =
    header.replace(/^Bearer\s+/i, "").trim() ||
    new URL(req.url).searchParams.get("secret") ||
    "";
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runWeeklyMarketingAnalysis({
    trigger: "weekly_cron",
    activateStrategy: false,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: isMarketingWeeklyCronEnabled(),
    hasSecret: Boolean(getMarketingCronSecret()),
    scheduleHint: "Weekly Monday 01:00 UTC (~10:00 JST) when enabled",
  });
}
