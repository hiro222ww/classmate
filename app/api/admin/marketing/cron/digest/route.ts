import { NextResponse } from "next/server";
import { safeEqualString } from "@/lib/adminAuth";
import {
  getMarketingCronSecret,
  getMarketingOpsDigestScheduleHint,
  isMarketingOpsDigestEnabled,
  MARKETING_OPS_DIGEST_CRON_EXPR_1900_JST,
} from "@/lib/marketing/config";
import { sendMarketingOpsDigest } from "@/lib/marketing/opsDigest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Evening ops digest (intended: 19:00 JST).
 * Summarizes UTM results + suggests draft posts for tonight.
 * Does NOT approve or publish SNS.
 */
export async function POST(req: Request) {
  if (!isMarketingOpsDigestEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "ops_digest_disabled",
        detail: "Set MARKETING_OPS_DIGEST_ENABLED=1 after operator approval.",
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
  if (!safeEqualString(provided, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await sendMarketingOpsDigest();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: isMarketingOpsDigestEnabled(),
    hasSecret: Boolean(getMarketingCronSecret()),
    scheduleHint: getMarketingOpsDigestScheduleHint(),
    vercelCronExpr: MARKETING_OPS_DIGEST_CRON_EXPR_1900_JST,
  });
}
