import { NextResponse } from "next/server";
import {
  getMarketingOpsDigestScheduleHint,
  isMarketingOpsDigestEnabled,
  MARKETING_OPS_DIGEST_CRON_EXPR_1900_JST,
} from "@/lib/marketing/config";
import {
  hasMarketingCronSecretConfigured,
  matchesMarketingCronSecret,
} from "@/lib/marketing/cronAuth";
import { sendMarketingOpsDigest } from "@/lib/marketing/opsDigest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Evening ops digest (intended: 19:00 JST — vercel.json `0 10 * * *`).
 * Summarizes UTM results + suggests draft posts for tonight.
 * Does NOT approve or publish SNS.
 *
 * Auth: Bearer CRON_SECRET or MARKETING_CRON_SECRET (or ?secret=).
 * Gate: MARKETING_OPS_DIGEST_ENABLED=1.
 */
export async function POST(req: Request) {
  if (!isMarketingOpsDigestEnabled()) {
    console.info("[marketing/cron/digest] skipped: ops_digest_disabled");
    return NextResponse.json(
      {
        ok: false,
        error: "ops_digest_disabled",
        detail: "Set MARKETING_OPS_DIGEST_ENABLED=1 after operator approval.",
      },
      { status: 403 }
    );
  }

  if (!hasMarketingCronSecretConfigured()) {
    console.error("[marketing/cron/digest] failed: cron_secret_missing");
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
    console.warn("[marketing/cron/digest] failed: unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendMarketingOpsDigest();
    console.info("[marketing/cron/digest] ok", {
      fingerprint: result.fingerprint,
      candidateIds: result.candidateIds,
      email: result.email?.status,
      discord: result.discord?.status,
      detail: result.detail,
      error: result.error,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[marketing/cron/digest] failed:", message);
    return NextResponse.json(
      { ok: false, error: "digest_failed", detail: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: isMarketingOpsDigestEnabled(),
    hasSecret: hasMarketingCronSecretConfigured(),
    scheduleHint: getMarketingOpsDigestScheduleHint(),
    vercelCronExpr: MARKETING_OPS_DIGEST_CRON_EXPR_1900_JST,
  });
}
