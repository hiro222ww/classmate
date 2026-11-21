import { NextResponse } from "next/server";
import { safeEqualString } from "@/lib/adminAuth";
import {
  getMarketingCronSecret,
  isMarketingCronEnabled,
} from "@/lib/marketing/config";
import { generateMarketingPosts } from "@/lib/marketing/generatePosts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily AI draft generation hook (intended JST 09:00).
 * Disabled unless MARKETING_CRON_ENABLED=1 and MARKETING_CRON_SECRET matches.
 * Does NOT auto-publish — creates draft rows only.
 */
export async function POST(req: Request) {
  if (!isMarketingCronEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "cron_disabled",
        detail: "Set MARKETING_CRON_ENABLED=1 after operator approval.",
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

  const result = await generateMarketingPosts({
    trigger: "daily_generate",
    allowTemplateFallback: true,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(req: Request) {
  // Health / status for operators — no generation.
  return NextResponse.json({
    ok: true,
    enabled: isMarketingCronEnabled(),
    hasSecret: Boolean(getMarketingCronSecret()),
    scheduleHint: "0 0 9 * * * Asia/Tokyo via Vercel Cron when enabled",
  });
}
