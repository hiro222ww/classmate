import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MetricValue =
  | { measured: true; value: number }
  | { measured: false; reason: string };

export type MarketingDashboardMetrics = {
  rangeDays: number;
  startIso: string;
  endIso: string;
  visitsBySource: Array<{ source: string; visits: number; uniqueDevices: number }>;
  dailyVisits: Array<{ day: string; visits: number }>;
  registrationsBySource: Array<{ source: string; count: number }>;
  visitToRegisterRateBySource: Array<{
    source: string;
    visits: number;
    registrations: number;
    rate: number | null;
  }>;
  callStartedBySource: Array<{ source: string; count: number }>;
  /** Peer-established call success is not a distinct funnel event yet. */
  callEstablished: MetricValue;
  postPerformance: Array<{
    utmContent: string;
    postId: string | null;
    bodyPreview: string | null;
    visits: number;
    registrations: number;
    callStarted: number;
  }>;
  notes: string[];
};

function jstDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function emptyMetrics(rangeDays: number): MarketingDashboardMetrics {
  const end = new Date();
  const start = new Date(end.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  return {
    rangeDays,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    visitsBySource: [],
    dailyVisits: [],
    registrationsBySource: [],
    visitToRegisterRateBySource: [],
    callStartedBySource: [],
    callEstablished: {
      measured: false,
      reason: "通話成立の専用イベントが未定義のため未計測（call_started のみ実測）",
    },
    postPerformance: [],
    notes: [],
  };
}

function metaUtmSource(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const v = String(m.utm_source ?? m.utmSource ?? "").trim();
  return v || null;
}

function metaUtmContent(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const v = String(m.utm_content ?? m.utmContent ?? "").trim();
  return v || null;
}

/**
 * Aggregate SNS marketing metrics from page_visits + product_funnel_events.
 * Missing signals are returned as 未計測 — never estimated.
 */
export async function loadMarketingDashboardMetrics(params?: {
  rangeDays?: number;
}): Promise<
  | { ok: true; metrics: MarketingDashboardMetrics }
  | { ok: false; error: string; detail?: string; migrationHint?: string }
> {
  const rangeDays = Math.min(Math.max(params?.rangeDays ?? 14, 1), 90);
  const end = new Date();
  const start = new Date(end.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const notes: string[] = [];

  const { data: visits, error: visitError } = await supabaseAdmin
    .from("page_visits")
    .select("id, device_id, visited_at, utm_source, utm_medium, utm_campaign, utm_content")
    .gte("visited_at", startIso)
    .lte("visited_at", endIso)
    .not("utm_source", "is", null)
    .limit(5000);

  if (visitError) {
    const missingUtm = /utm_source|column .* does not exist/i.test(visitError.message);
    return {
      ok: false,
      error: "visits_query_failed",
      detail: visitError.message,
      migrationHint: missingUtm
        ? "Apply supabase/migrations/20261116140000_marketing_phase23.sql"
        : undefined,
    };
  }

  const socialVisits = (visits ?? []).filter((v) => {
    const medium = String(v.utm_medium ?? "").toLowerCase();
    return !medium || medium === "social";
  });

  if ((visits ?? []).length === 0) {
    notes.push("期間内のUTM付き訪問がまだありません（マイグレーション適用後に蓄積されます）");
  }

  const visitsBySourceMap = new Map<
    string,
    { visits: number; devices: Set<string> }
  >();
  const dailyMap = new Map<string, number>();
  const contentVisitMap = new Map<string, number>();

  for (const v of socialVisits) {
    const source = String(v.utm_source ?? "unknown");
    const bucket = visitsBySourceMap.get(source) ?? {
      visits: 0,
      devices: new Set<string>(),
    };
    bucket.visits += 1;
    if (v.device_id) bucket.devices.add(String(v.device_id));
    visitsBySourceMap.set(source, bucket);

    const day = jstDay(String(v.visited_at));
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);

    const content = String(v.utm_content ?? "").trim();
    if (content) {
      contentVisitMap.set(content, (contentVisitMap.get(content) ?? 0) + 1);
    }
  }

  const { data: funnelRows, error: funnelError } = await supabaseAdmin
    .from("product_funnel_events")
    .select("event_name, device_id, meta, created_at")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .in("event_name", ["min_profile_saved", "call_started"])
    .limit(5000);

  if (funnelError) {
    return {
      ok: false,
      error: "funnel_query_failed",
      detail: funnelError.message,
    };
  }

  const registrationsBySourceMap = new Map<string, number>();
  const callStartedBySourceMap = new Map<string, number>();
  const contentRegMap = new Map<string, number>();
  const contentCallMap = new Map<string, number>();
  let funnelWithUtm = 0;

  for (const ev of funnelRows ?? []) {
    const source = metaUtmSource(ev.meta);
    const content = metaUtmContent(ev.meta);
    if (!source && !content) continue;
    funnelWithUtm += 1;
    const src = source || "unknown";
    if (ev.event_name === "min_profile_saved") {
      registrationsBySourceMap.set(src, (registrationsBySourceMap.get(src) ?? 0) + 1);
      if (content) contentRegMap.set(content, (contentRegMap.get(content) ?? 0) + 1);
    }
    if (ev.event_name === "call_started") {
      callStartedBySourceMap.set(src, (callStartedBySourceMap.get(src) ?? 0) + 1);
      if (content) contentCallMap.set(content, (contentCallMap.get(content) ?? 0) + 1);
    }
  }

  if (funnelWithUtm === 0) {
    notes.push(
      "ファネルイベントにUTM metaがまだ付いていません（クライアント更新後の新規イベントから計測）"
    );
  }

  const { data: posts } = await supabaseAdmin
    .from("marketing_posts")
    .select("id, body_text, utm_content")
    .not("utm_content", "is", null)
    .limit(500);

  const postByContent = new Map<
    string,
    { id: string; body: string }
  >();
  for (const p of posts ?? []) {
    const key = String(p.utm_content ?? "").trim();
    if (key) {
      postByContent.set(key, {
        id: String(p.id),
        body: String(p.body_text ?? ""),
      });
    }
  }

  const allContents = new Set<string>([
    ...contentVisitMap.keys(),
    ...contentRegMap.keys(),
    ...contentCallMap.keys(),
  ]);

  const metrics = emptyMetrics(rangeDays);
  metrics.startIso = startIso;
  metrics.endIso = endIso;
  metrics.notes = notes;

  metrics.visitsBySource = [...visitsBySourceMap.entries()]
    .map(([source, v]) => ({
      source,
      visits: v.visits,
      uniqueDevices: v.devices.size,
    }))
    .sort((a, b) => b.visits - a.visits);

  metrics.dailyVisits = [...dailyMap.entries()]
    .map(([day, visits]) => ({ day, visits }))
    .sort((a, b) => a.day.localeCompare(b.day));

  metrics.registrationsBySource = [...registrationsBySourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  metrics.callStartedBySource = [...callStartedBySourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const sources = new Set([
    ...metrics.visitsBySource.map((x) => x.source),
    ...metrics.registrationsBySource.map((x) => x.source),
  ]);

  metrics.visitToRegisterRateBySource = [...sources].map((source) => {
    const visits =
      metrics.visitsBySource.find((x) => x.source === source)?.visits ?? 0;
    const registrations =
      metrics.registrationsBySource.find((x) => x.source === source)?.count ?? 0;
    return {
      source,
      visits,
      registrations,
      rate: visits > 0 ? registrations / visits : null,
    };
  });

  metrics.postPerformance = [...allContents].map((utmContent) => {
    const post = postByContent.get(utmContent);
    return {
      utmContent,
      postId: post?.id ?? null,
      bodyPreview: post?.body ? post.body.slice(0, 60) : null,
      visits: contentVisitMap.get(utmContent) ?? 0,
      registrations: contentRegMap.get(utmContent) ?? 0,
      callStarted: contentCallMap.get(utmContent) ?? 0,
    };
  }).sort((a, b) => b.visits - a.visits);

  return { ok: true, metrics };
}
