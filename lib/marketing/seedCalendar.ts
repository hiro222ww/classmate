import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildTwoWeekCalendarPlans,
  calendarPlanToInsertRow,
  jstScheduledIso,
} from "@/lib/marketing/calendar14";
import type { MarketingPostRow } from "@/lib/marketing/types";

function jstDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function seedTwoWeekMarketingCalendar(params?: {
  startYmd?: string;
  replaceDraftCalendar?: boolean;
}): Promise<
  | { ok: true; posts: MarketingPostRow[]; startYmd: string; count: number }
  | { ok: false; error: string; detail?: string }
> {
  const startYmd = params?.startYmd?.trim() || jstDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd)) {
    return { ok: false, error: "invalid_start_ymd" };
  }

  const plans = buildTwoWeekCalendarPlans(startYmd);

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("marketing_campaigns")
    .insert({
      name: `X 2週間カレンダー ${startYmd}`,
      channel: "x",
      status: "active",
      notes: "curated calendar14 — review/approve in admin before any publish",
    })
    .select("id")
    .single();

  if (campaignError) {
    return {
      ok: false,
      error: "campaign_insert_failed",
      detail: campaignError.message,
    };
  }

  const inserts = plans.map((plan) =>
    calendarPlanToInsertRow({
      plan,
      campaignId: campaign.id,
      scheduledAtIso: jstScheduledIso({
        startYmd,
        dayOffset: plan.dayOffset,
        hourJst: plan.hourJst,
        minuteJst: plan.minuteJst,
      }),
    })
  );

  let { data: posts, error } = await supabaseAdmin
    .from("marketing_posts")
    .insert(inserts)
    .select("*");

  if (
    error &&
    /expected_action|quality_score|quality_notes|question|story|column .* does not exist|check constraint/i.test(
      error.message
    )
  ) {
    const legacy = inserts.map((row) => {
      const {
        expected_action: _e,
        quality_score: _q,
        quality_notes: _n,
        ...rest
      } = row;
      const post_type =
        rest.post_type === "question"
          ? "empathy"
          : rest.post_type === "story"
            ? "intro"
            : rest.post_type;
      return { ...rest, post_type };
    });
    const retry = await supabaseAdmin.from("marketing_posts").insert(legacy).select("*");
    posts = retry.data;
    error = retry.error;
  }

  if (error) {
    return { ok: false, error: "posts_insert_failed", detail: error.message };
  }

  return {
    ok: true,
    posts: (posts ?? []) as MarketingPostRow[],
    startYmd,
    count: posts?.length ?? 0,
  };
}
