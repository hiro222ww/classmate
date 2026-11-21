import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { FeedbackWeeklySnapshot } from "@/lib/feedback/types";

/**
 * Anonymized feedback aggregates for weekly analysis.
 * Never includes body_raw, device_id, or user_id.
 */
export async function buildFeedbackWeeklySnapshot(
  days = 7
): Promise<FeedbackWeeklySnapshot> {
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const notes: string[] = [
    "フィードバック本文・端末IDは含めない（匿名集計のみ）",
    "安全関連は人間レビュー必須（AI単独却下禁止）",
    "uniqueVoices は同一端末の重複テーマを1票として数える",
  ];

  const { data: rows, error } = await supabaseAdmin
    .from("user_feedback")
    .select(
      "id, ai_category, unique_voice_key, safety_flag, cluster_id, created_at"
    )
    .gte("created_at", start)
    .limit(2000);

  if (error) {
    return {
      days,
      totalReports: 0,
      uniqueVoices: 0,
      byCategory: [],
      openClusters: [],
      safetyOpenCount: 0,
      notes: [...notes, `feedback_query_failed: ${error.message}`],
    };
  }

  const list = rows ?? [];
  const voices = new Set(list.map((r) => String(r.unique_voice_key)));
  const byCat = new Map<string, { reports: number; voices: Set<string> }>();
  for (const r of list) {
    const cat = String(r.ai_category ?? "other");
    const bucket = byCat.get(cat) ?? { reports: 0, voices: new Set() };
    bucket.reports += 1;
    bucket.voices.add(String(r.unique_voice_key));
    byCat.set(cat, bucket);
  }

  const { data: clusters } = await supabaseAdmin
    .from("user_feedback_clusters")
    .select(
      "title, category, severity, unique_reporter_count, report_count, call_impact, safety_flag, status, last_seen_at"
    )
    .in("status", ["open", "accepted", "held"])
    .gte("last_seen_at", start)
    .order("unique_reporter_count", { ascending: false })
    .limit(20);

  const safetyOpenCount = (clusters ?? []).filter((c) => c.safety_flag).length;

  return {
    days,
    totalReports: list.length,
    uniqueVoices: voices.size,
    byCategory: [...byCat.entries()].map(([category, v]) => ({
      category,
      reports: v.reports,
      uniqueVoices: v.voices.size,
    })),
    openClusters: (clusters ?? []).map((c) => ({
      title: String(c.title),
      category: String(c.category),
      severity: String(c.severity),
      uniqueReporterCount: Number(c.unique_reporter_count) || 0,
      reportCount: Number(c.report_count) || 0,
      callImpact: String(c.call_impact),
      safetyFlag: Boolean(c.safety_flag),
    })),
    safetyOpenCount,
    notes,
  };
}

export function feedbackSnapshotToMarkdown(snap: FeedbackWeeklySnapshot): string {
  const lines = [
    "## ユーザーフィードバック（匿名集計）",
    `- 期間: 直近${snap.days}日`,
    `- 件数: ${snap.totalReports}（ユニーク声 ${snap.uniqueVoices}）`,
    `- 安全フラグ付きオープンクラスタ: ${snap.safetyOpenCount}`,
    "",
    "### カテゴリ別",
    ...(snap.byCategory.length
      ? snap.byCategory.map(
          (c) =>
            `- ${c.category}: ${c.reports}件 / ユニーク ${c.uniqueVoices}`
        )
      : ["- （なし）"]),
    "",
    "### 主なテーマ（クラスタ）",
    ...(snap.openClusters.length
      ? snap.openClusters.slice(0, 10).map(
          (c) =>
            `- [${c.severity}] ${c.category}: ${c.title}（声${c.uniqueReporterCount}/件${c.reportCount}` +
            `${c.safetyFlag ? "・安全" : ""}` +
            `${c.callImpact !== "none" ? `・通話影響:${c.callImpact}` : ""}）`
        )
      : ["- （なし）"]),
    "",
    ...snap.notes.map((n) => `- 注: ${n}`),
  ];
  return lines.join("\n");
}
