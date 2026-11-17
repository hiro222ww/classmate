import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadMarketingDashboardMetrics } from "@/lib/marketing/metrics";
import type { MarketingDashboardMetrics, MetricValue } from "@/lib/marketing/metrics";

export type PeriodAnalysisSnapshot = {
  days: number;
  metrics: MarketingDashboardMetrics;
  byPostType: Array<{
    postType: string;
    posts: number;
    visits: number;
    registrations: number;
    callStarted: number;
  }>;
  byHourJst: Array<{
    hour: number;
    posts: number;
    visits: number;
    registrations: number;
  }>;
  callEstablished: MetricValue;
  sampleSize: {
    utmVisits: number;
    registrationsWithUtm: number;
    publishedOrScheduledPosts: number;
  };
  dataQuality: "insufficient" | "limited" | "adequate";
};

function jstHour(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/**
 * Build an anonymized analysis snapshot for 7d or 28d.
 * Never invents unmeasured X impressions/likes.
 */
export async function buildPeriodAnalysisSnapshot(
  days: 7 | 28
): Promise<
  | { ok: true; snapshot: PeriodAnalysisSnapshot }
  | { ok: false; error: string; detail?: string; migrationHint?: string }
> {
  const loaded = await loadMarketingDashboardMetrics({ rangeDays: days });
  if (!loaded.ok) {
    return {
      ok: false,
      error: loaded.error,
      detail: loaded.detail,
      migrationHint: loaded.migrationHint,
    };
  }
  const metrics = loaded.metrics;

  const { data: posts, error: postsError } = await supabaseAdmin
    .from("marketing_posts")
    .select("id, post_type, status, scheduled_at, published_at, created_at, utm_content")
    .gte("created_at", metrics.startIso)
    .lte("created_at", metrics.endIso)
    .limit(500);

  if (postsError) {
    return { ok: false, error: "posts_query_failed", detail: postsError.message };
  }

  const postRows = posts ?? [];
  const byTypeMap = new Map<
    string,
    { posts: number; visits: number; registrations: number; callStarted: number }
  >();
  const byHourMap = new Map<
    number,
    { posts: number; visits: number; registrations: number }
  >();

  const perfByContent = new Map(
    metrics.postPerformance.map((p) => [p.utmContent, p])
  );

  for (const p of postRows) {
    const type = String(p.post_type ?? "unknown");
    const bucket = byTypeMap.get(type) ?? {
      posts: 0,
      visits: 0,
      registrations: 0,
      callStarted: 0,
    };
    bucket.posts += 1;
    const content = String(p.utm_content ?? "").trim();
    const perf = content ? perfByContent.get(content) : null;
    if (perf) {
      bucket.visits += perf.visits;
      bucket.registrations += perf.registrations;
      bucket.callStarted += perf.callStarted;
    }
    byTypeMap.set(type, bucket);

    const when = String(p.published_at || p.scheduled_at || p.created_at || "");
    if (when) {
      const hour = jstHour(when);
      const hb = byHourMap.get(hour) ?? { posts: 0, visits: 0, registrations: 0 };
      hb.posts += 1;
      if (perf) {
        hb.visits += perf.visits;
        hb.registrations += perf.registrations;
      }
      byHourMap.set(hour, hb);
    }
  }

  const utmVisits = metrics.visitsBySource.reduce((s, r) => s + r.visits, 0);
  const registrationsWithUtm = metrics.registrationsBySource.reduce(
    (s, r) => s + r.count,
    0
  );
  const publishedOrScheduledPosts = postRows.filter((p) =>
    ["published", "scheduled", "approved"].includes(String(p.status))
  ).length;

  let dataQuality: PeriodAnalysisSnapshot["dataQuality"] = "insufficient";
  if (utmVisits >= 30 && registrationsWithUtm >= 5) dataQuality = "adequate";
  else if (utmVisits >= 5 || publishedOrScheduledPosts >= 3) dataQuality = "limited";

  return {
    ok: true,
    snapshot: {
      days,
      metrics,
      byPostType: [...byTypeMap.entries()]
        .map(([postType, v]) => ({ postType, ...v }))
        .sort((a, b) => b.visits - a.visits),
      byHourJst: [...byHourMap.entries()]
        .map(([hour, v]) => ({ hour, ...v }))
        .sort((a, b) => a.hour - b.hour),
      callEstablished: metrics.callEstablished,
      sampleSize: {
        utmVisits,
        registrationsWithUtm,
        publishedOrScheduledPosts,
      },
      dataQuality,
    },
  };
}

/** Strip PII before sending aggregates to OpenAI. */
export function sanitizeSnapshotForAi(snapshot: PeriodAnalysisSnapshot) {
  return {
    days: snapshot.days,
    dataQuality: snapshot.dataQuality,
    sampleSize: snapshot.sampleSize,
    visitsBySource: snapshot.metrics.visitsBySource,
    registrationsBySource: snapshot.metrics.registrationsBySource,
    visitToRegisterRateBySource: snapshot.metrics.visitToRegisterRateBySource,
    callStartedBySource: snapshot.metrics.callStartedBySource,
    callEstablished: snapshot.callEstablished,
    byPostType: snapshot.byPostType,
    byHourJst: snapshot.byHourJst,
    postPerformanceTop: snapshot.metrics.postPerformance.slice(0, 15).map((p) => ({
      utmContent: p.utmContent,
      bodyPreview: p.bodyPreview,
      visits: p.visits,
      registrations: p.registrations,
      callStarted: p.callStarted,
    })),
    notes: snapshot.metrics.notes,
    notMeasured: [
      "X impressions/likes/replies (no official metrics wired)",
      snapshot.callEstablished.measured
        ? null
        : snapshot.callEstablished.reason,
    ].filter(Boolean),
  };
}
