import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { buildTwoWeekCalendarPlans } from "@/lib/marketing/calendar14";
import { seedTwoWeekMarketingCalendar } from "@/lib/marketing/seedCalendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Preview curated 14-day plans (no DB write). */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const startYmd =
    String(searchParams.get("start") ?? "").trim() ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const plans = buildTwoWeekCalendarPlans(startYmd);
  return NextResponse.json({
    ok: true,
    startYmd,
    count: plans.length,
    plans: plans.map((p) => ({
      dayOffset: p.dayOffset,
      timeJst: `${String(p.hourJst).padStart(2, "0")}:${String(p.minuteJst).padStart(2, "0")}`,
      post_type: p.post_type,
      body_text: p.body_text,
      purpose: p.purpose,
      expected_action: p.expected_action,
      cta: p.cta,
      effectHypothesis: p.effectHypothesis,
      includeUtm: p.includeUtm,
      utmContent: p.utmContent,
    })),
  });
}

/** Insert curated calendar drafts into marketing_posts for admin review. */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const startYmd = String(body.startYmd ?? body.start ?? "").trim() || undefined;
    const result = await seedTwoWeekMarketingCalendar({ startYmd });
    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "calendar_seed_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
