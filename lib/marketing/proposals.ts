import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { UiSuggestion } from "@/lib/marketing/uiSuggestions";
import type { PeriodAnalysisSnapshot } from "@/lib/marketing/analysisMetrics";

export type ProposalCategory = "ui_ux" | "funnel" | "copy" | "image" | "other";
export type ProposalPriority = "high" | "medium" | "low";
export type ProposalStatus = "pending" | "accepted" | "held" | "rejected";

export type ImprovementProposalRow = {
  id: string;
  source_report_id: string | null;
  category: ProposalCategory;
  area: string;
  title: string;
  summary: string;
  detail_markdown: string | null;
  priority: ProposalPriority;
  status: ProposalStatus;
  fingerprint: string;
  evidence_kind: string | null;
  validation_kpi: string | null;
  image_prompt: string | null;
  composition_notes: string | null;
  metrics_context: Record<string, unknown>;
  notified_at: string | null;
  notification_channel: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposalDraft = {
  category: ProposalCategory;
  area: string;
  title: string;
  summary: string;
  detail_markdown?: string;
  priority: ProposalPriority;
  evidence_kind?: string;
  validation_kpi?: string;
  image_prompt?: string | null;
  composition_notes?: string | null;
  metrics_context?: Record<string, unknown>;
};

export function fingerprintProposal(draft: Pick<ProposalDraft, "area" | "title" | "summary">): string {
  const raw = `${draft.area.trim()}|${draft.title.trim()}|${draft.summary.trim()}`.toLowerCase();
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function categoryForArea(area: string): ProposalCategory {
  if (area === "home_hero") return "image";
  if (area === "catchcopy") return "copy";
  if (area === "onboarding" || area === "buttons") return "funnel";
  if (area === "random_call" || area === "waiting") return "ui_ux";
  return "ui_ux";
}

/** Build proposals from code-review UI suggestions + measured funnel rates. */
export function buildProposalDraftsFromAnalysis(params: {
  uiSuggestions: UiSuggestion[];
  d7: Pick<
    PeriodAnalysisSnapshot,
    "sampleSize" | "dataQuality" | "metrics" | "callEstablished"
  >;
}): ProposalDraft[] {
  const drafts: ProposalDraft[] = params.uiSuggestions.map((u) => ({
    category: categoryForArea(u.area),
    area: u.area,
    title: u.title,
    summary: u.reason,
    detail_markdown: [
      `### ${u.title}`,
      "",
      u.reason,
      "",
      `- 根拠: ${u.evidenceKind} — ${u.evidence}`,
      `- 検証KPI: ${u.validationKpi}`,
      u.imagePrompt ? `- 画像プロンプト案: ${u.imagePrompt}` : null,
      u.compositionNotes ? `- 構図メモ: ${u.compositionNotes}` : null,
      "",
      "> UI・画像の本番変更は運営者の承認後のみ。",
    ]
      .filter(Boolean)
      .join("\n"),
    priority: u.priority,
    evidence_kind: u.evidenceKind,
    validation_kpi: u.validationKpi,
    image_prompt: u.imagePrompt ?? null,
    composition_notes: u.compositionNotes ?? null,
    metrics_context: { source: "ui_suggestion" },
  }));

  const visits = params.d7.sampleSize.utmVisits;
  const regs = params.d7.sampleSize.registrationsWithUtm;
  const regRate = visits > 0 ? regs / visits : null;
  const callStarted = params.d7.metrics.callStartedBySource.reduce(
    (s, r) => s + r.count,
    0
  );
  const callRate = regs > 0 ? callStarted / regs : null;

  if (visits > 0 && regRate != null && regRate < 0.05) {
    drafts.push({
      category: "funnel",
      area: "onboarding",
      title: "UTM訪問→登録の転換が低い可能性",
      summary: `直近7日のUTM訪問 ${visits} に対し登録 ${regs}（率 ${(regRate * 100).toFixed(1)}%）。登録導線・キャッチの見直しを検討。`,
      detail_markdown: [
        "### 登録転換",
        "",
        `- UTM訪問: ${visits}`,
        `- UTM付き登録: ${regs}`,
        `- 登録率: ${(regRate * 100).toFixed(1)}%`,
        `- データ品質: ${params.d7.dataQuality}`,
        "",
        "ホームキャッチ・登録CTA・オンボーディング後の次アクションを検証してください。",
        "本番UI変更は承認後のみ。",
      ].join("\n"),
      priority: "high",
      evidence_kind: "measured",
      validation_kpi: "utm_visit → registration",
      metrics_context: { visits, regs, regRate },
    });
  }

  if (regs > 0 && callRate != null && callRate < 0.2) {
    drafts.push({
      category: "funnel",
      area: "random_call",
      title: "登録後の通話開始率が低い可能性",
      summary: `直近7日の登録 ${regs} に対し通話開始 ${callStarted}（率 ${(callRate * 100).toFixed(1)}%）。通話導線・待機UXの改善を検討。`,
      detail_markdown: [
        "### 通話開始転換",
        "",
        `- 登録: ${regs}`,
        `- call_started: ${callStarted}`,
        `- 通話開始率: ${(callRate * 100).toFixed(1)}%`,
        `- 通話成立: 専用イベント未定義のため未計測`,
        "",
        "ランダム通話CTA優先度・「短時間OK」コピー・招待導線を検証してください。",
      ].join("\n"),
      priority: "high",
      evidence_kind: "measured",
      validation_kpi: "registration → call_started",
      metrics_context: { regs, callStarted, callRate },
    });
  }

  if (params.d7.dataQuality === "insufficient") {
    drafts.push({
      category: "other",
      area: "measurement",
      title: "集客サンプル不足 — 計測と投稿を継続",
      summary:
        "直近7日のUTMサンプルが少なく優劣を断定できない。投稿と計測を続け、次回分析で再評価する。",
      detail_markdown:
        "データ品質が insufficient です。仮説ベースの改善案は保留し、投稿数とUTM計測を優先してください。",
      priority: "medium",
      evidence_kind: "measured",
      validation_kpi: "utmVisits / registrationsWithUtm sample size",
      metrics_context: { dataQuality: params.d7.dataQuality, ...params.d7.sampleSize },
    });
  }

  return drafts;
}

export async function upsertProposalDrafts(params: {
  reportId: string;
  drafts: ProposalDraft[];
}): Promise<{ created: ImprovementProposalRow[]; skippedDuplicates: number }> {
  const created: ImprovementProposalRow[] = [];
  let skippedDuplicates = 0;

  for (const draft of params.drafts) {
    const fingerprint = fingerprintProposal(draft);
    const row = {
      source_report_id: params.reportId,
      category: draft.category,
      area: draft.area,
      title: draft.title,
      summary: draft.summary,
      detail_markdown: draft.detail_markdown ?? null,
      priority: draft.priority,
      status: "pending" as const,
      fingerprint,
      evidence_kind: draft.evidence_kind ?? null,
      validation_kpi: draft.validation_kpi ?? null,
      image_prompt: draft.image_prompt ?? null,
      composition_notes: draft.composition_notes ?? null,
      metrics_context: draft.metrics_context ?? {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("marketing_improvement_proposals")
      .insert(row)
      .select("*")
      .maybeSingle();

    if (error) {
      // Unique open-fingerprint conflict → treat as duplicate skip
      if (/duplicate|unique/i.test(error.message)) {
        skippedDuplicates += 1;
        continue;
      }
      throw new Error(error.message);
    }
    if (data) created.push(data as ImprovementProposalRow);
  }

  return { created, skippedDuplicates };
}

export async function listImprovementProposals(params?: {
  status?: ProposalStatus | "open" | "all";
  limit?: number;
}): Promise<ImprovementProposalRow[]> {
  const limit = params?.limit ?? 50;
  let q = supabaseAdmin
    .from("marketing_improvement_proposals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!params?.status || params.status === "open") {
    q = q.in("status", ["pending", "held"]);
  } else if (params.status !== "all") {
    q = q.eq("status", params.status);
  }

  const { data } = await q;
  return (data ?? []) as ImprovementProposalRow[];
}

export async function setProposalStatus(params: {
  id: string;
  status: Exclude<ProposalStatus, "pending">;
  reviewNote?: string | null;
}): Promise<
  | { ok: true; proposal: ImprovementProposalRow }
  | { ok: false; error: string; detail?: string }
> {
  const { data, error } = await supabaseAdmin
    .from("marketing_improvement_proposals")
    .update({
      status: params.status,
      reviewed_at: new Date().toISOString(),
      review_note: params.reviewNote?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "proposal_update_failed", detail: error?.message };
  }
  return { ok: true, proposal: data as ImprovementProposalRow };
}

export async function markProposalsNotified(params: {
  ids: string[];
  channel: "email" | "web_push" | "none";
}): Promise<void> {
  if (!params.ids.length) return;
  await supabaseAdmin
    .from("marketing_improvement_proposals")
    .update({
      notified_at: new Date().toISOString(),
      notification_channel: params.channel,
      updated_at: new Date().toISOString(),
    })
    .in("id", params.ids);
}
