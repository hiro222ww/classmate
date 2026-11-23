import { NextResponse } from "next/server";
import {
  getMarketingWeeklyCronScheduleHint,
  isMarketingWeeklyCronEnabled,
  MARKETING_WEEKLY_CRON_EXPR_SUNDAY_20_JST,
} from "@/lib/marketing/config";
import {
  hasMarketingCronSecretConfigured,
  matchesMarketingCronSecret,
} from "@/lib/marketing/cronAuth";
import { getAdminNotifyChannelCapability } from "@/lib/marketing/adminNotify";
import { runWeeklyMarketingAnalysis } from "@/lib/marketing/weeklyReport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Weekly analysis cron hook (intended: Sunday 20:00 JST).
 * Disabled unless MARKETING_WEEKLY_CRON_ENABLED=1.
 * Creates report + proposals, auto-activates SNS generation strategy (not SNS publish),
 * and may email operators when MARKETING_ADMIN_NOTIFY_ENABLED=1.
 * UI/image changes are never auto-applied.
 *
 * Auth: Bearer CRON_SECRET or MARKETING_CRON_SECRET.
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

  if (!hasMarketingCronSecretConfigured()) {
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
  if (!matchesMarketingCronSecret(provided)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runWeeklyMarketingAnalysis({
    trigger: "weekly_cron",
    // SNS投稿方針のみ自動反映（公開・UI変更はしない）
    activateStrategy: true,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET() {
  const notify = getAdminNotifyChannelCapability();
  return NextResponse.json({
    ok: true,
    enabled: isMarketingWeeklyCronEnabled(),
    hasSecret: hasMarketingCronSecretConfigured(),
    scheduleHint: getMarketingWeeklyCronScheduleHint(),
    vercelCronExpr: MARKETING_WEEKLY_CRON_EXPR_SUNDAY_20_JST,
    notifyCapability: notify,
  });
}
