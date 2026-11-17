import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildPeriodAnalysisSnapshot,
  sanitizeSnapshotForAi,
} from "@/lib/marketing/analysisMetrics";
import {
  estimateOpenAiCostUsd,
  getMarketingOpenAiApiKey,
  getMarketingOpenAiModel,
  getMarketingWeeklyBudgetUsd,
  getMarketingWeeklyRunLimit,
  isMarketingWeeklyCronEnabled,
} from "@/lib/marketing/config";
import { buildCodeReviewUiSuggestions } from "@/lib/marketing/uiSuggestions";
import {
  buildPromptAddonFromGuidance,
  createStrategyVersion,
  type StrategyGuidance,
} from "@/lib/marketing/strategy";

export type WeeklyReportResult = {
  ok: boolean;
  error?: string;
  detail?: string;
  reportId?: string;
  strategyId?: string;
  usedFallbackAnalysis?: boolean;
};

function jstWeekBounds(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function heuristicAnalysisMarkdown(params: {
  d7: ReturnType<typeof sanitizeSnapshotForAi>;
  d28: ReturnType<typeof sanitizeSnapshotForAi>;
}): string {
  const { d7, d28 } = params;
  const lines = [
    "## 今週の成果（実測のみ）",
    `- 直近7日 UTM訪問: ${d7.sampleSize.utmVisits}`,
    `- 直近7日 UTM付き登録: ${d7.sampleSize.registrationsWithUtm}`,
    `- データ品質: ${d7.dataQuality}`,
    "",
    "## 前週/28日比較",
    `- 28日 UTM訪問: ${d28.sampleSize.utmVisits}`,
    `- 28日 UTM付き登録: ${d28.sampleSize.registrationsWithUtm}`,
    `- 28日データ品質: ${d28.dataQuality}`,
    "",
    "## 有効だった投稿の特徴",
    d7.dataQuality === "insufficient"
      ? "- サンプル不足のため断定不可。仮説として共感・質問型の交流投稿を継続。"
      : `- 訪問上位タイプ: ${d7.byPostType.slice(0, 3).map((t) => t.postType).join(", ") || "なし"}`,
    "",
    "## 改善が必要な点",
    "- Xの表示回数・いいねは未計測（公式連携なし）",
    "- 通話成立は専用イベント未定義のため未計測",
    "",
    "## 次週の投稿戦略（仮説）",
    "- 共感・質問を多め、紹介/参加促進は少数",
    "- URLは必要な投稿のみ",
    "",
    "## 検証すべき仮説",
    "- 夜21時台の投稿が訪問につながりやすいか",
    "- 質問型がリプライ経由の認知に効くか",
    "",
    "## 不確実性",
    `- ${d7.dataQuality === "adequate" ? "比較可能なサンプルあり" : "サンプルが少なく優劣は断定しない"}`,
  ];
  return lines.join("\n");
}

function heuristicStrategy(d7: ReturnType<typeof sanitizeSnapshotForAi>): StrategyGuidance {
  const topTypes = d7.byPostType.slice(0, 2).map((t) => t.postType);
  const preferredTypes = (
    topTypes.length >= 2 ? topTypes : ["empathy", "question", "invite"]
  ) as StrategyGuidance["preferredTypes"];
  const topHours = [...d7.byHourJst]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 2)
    .map((h) => h.hour);
  return {
    preferredTypes,
    themeHints: ["大人の雑談不足", "少人数なら話しやすい", "短時間でOK"],
    catchcopyHints: ["押し売りしない口語", "同年代と声でつながる"],
    ctaHints: ["必要なときだけ・覗くだけOK"],
    empathyToPromoRatio: "共感・質問 6 : 紹介・参加 4",
    preferredHoursJst: topHours.length ? topHours : [12, 21],
    avoidTopics: ["架空の口コミ", "出会い目的", "3人集まらないと始まらない"],
    notes: [
      d7.dataQuality === "insufficient"
        ? "データ不足のため仮説扱い"
        : "実測を優先し仮説は弱く適用",
    ],
  };
}

async function callOpenAiWeeklyReport(payload: unknown): Promise<
  | {
      ok: true;
      markdown: string;
      strategy: StrategyGuidance;
      uncertainty: string[];
      promptTokens: number;
      completionTokens: number;
      modelName: string;
      estimatedCostUsd: number;
    }
  | { ok: false; error: string; detail?: string }
> {
  const apiKey = getMarketingOpenAiApiKey();
  if (!apiKey) return { ok: false, error: "openai_api_key_missing" };

  const modelName = getMarketingOpenAiModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: [
              "あなたはClassmateのSNS集客アナリストです。",
              "渡されるのは匿名集計のみです。個人情報は含まれません。",
              "未計測指標を推測で埋めないこと。サンプルが少ない場合は断定しない。",
              "JSONで返してください: { analysis_markdown, strategy, uncertainty_notes }",
              "strategy は preferredTypes, themeHints, catchcopyHints, ctaHints, empathyToPromoRatio, preferredHoursJst, avoidTopics, notes を持つ。",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify(payload),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const errObj = json?.error as { message?: string } | undefined;
      return {
        ok: false,
        error: "openai_http_error",
        detail: errObj?.message || `HTTP ${res.status}`,
      };
    }
    const content = (
      json?.choices as Array<{ message?: { content?: string } }> | undefined
    )?.[0]?.message?.content;
    if (!content) return { ok: false, error: "openai_empty_content" };
    const parsed = JSON.parse(content) as {
      analysis_markdown?: string;
      strategy?: StrategyGuidance;
      uncertainty_notes?: string[];
    };
    const usage = json?.usage as
      | { prompt_tokens?: number; completion_tokens?: number }
      | undefined;
    const promptTokens = Number(usage?.prompt_tokens ?? 0) || 0;
    const completionTokens = Number(usage?.completion_tokens ?? 0) || 0;
    return {
      ok: true,
      markdown: String(parsed.analysis_markdown ?? "").trim() || "（分析本文なし）",
      strategy: parsed.strategy ?? heuristicStrategy(
        (payload as { d7: ReturnType<typeof sanitizeSnapshotForAi> }).d7
      ),
      uncertainty: Array.isArray(parsed.uncertainty_notes)
        ? parsed.uncertainty_notes.map(String)
        : [],
      promptTokens,
      completionTokens,
      modelName,
      estimatedCostUsd: estimateOpenAiCostUsd({ promptTokens, completionTokens }),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "openai_failed";
    return { ok: false, error: "openai_failed", detail: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runWeeklyMarketingAnalysis(params: {
  trigger: "weekly_cron" | "manual";
  activateStrategy?: boolean;
}): Promise<WeeklyReportResult> {
  const { start, end } = jstWeekBounds();

  // Budget / run limits for weekly kind
  const weekStartIso = start.toISOString();
  const { count: runCount } = await supabaseAdmin
    .from("marketing_ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("run_kind", "weekly_report")
    .gte("started_at", weekStartIso)
    .neq("status", "skipped");
  if ((runCount ?? 0) >= getMarketingWeeklyRunLimit()) {
    return { ok: false, error: "weekly_run_limit_reached" };
  }

  const { data: costRows } = await supabaseAdmin
    .from("marketing_ai_runs")
    .select("estimated_cost_usd")
    .eq("run_kind", "weekly_report")
    .gte("started_at", weekStartIso)
    .eq("status", "succeeded");
  const spent = (costRows ?? []).reduce(
    (s, r) => s + (Number(r.estimated_cost_usd) || 0),
    0
  );
  if (spent >= getMarketingWeeklyBudgetUsd()) {
    return { ok: false, error: "weekly_budget_reached" };
  }

  // Duplicate prevention: another running weekly job
  const { data: running } = await supabaseAdmin
    .from("marketing_ai_runs")
    .select("id")
    .eq("run_kind", "weekly_report")
    .eq("status", "running")
    .gte("started_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .limit(1);
  if (running && running.length > 0) {
    return { ok: false, error: "weekly_already_running" };
  }

  const { data: runRow, error: runErr } = await supabaseAdmin
    .from("marketing_ai_runs")
    .insert({
      run_kind: "weekly_report",
      status: "running",
      meta: { trigger: params.trigger },
    })
    .select("id")
    .single();
  if (runErr || !runRow?.id) {
    return { ok: false, error: "ai_run_insert_failed", detail: runErr?.message };
  }
  const runId = runRow.id as string;

  const s7 = await buildPeriodAnalysisSnapshot(7);
  const s28 = await buildPeriodAnalysisSnapshot(28);
  if (!s7.ok || !s28.ok) {
    const detail = !s7.ok ? s7.detail : s28.detail;
    await supabaseAdmin
      .from("marketing_ai_runs")
      .update({
        status: "failed",
        error_message: detail || "snapshot_failed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return { ok: false, error: "snapshot_failed", detail };
  }

  const d7 = sanitizeSnapshotForAi(s7.snapshot);
  const d28 = sanitizeSnapshotForAi(s28.snapshot);
  const uiSuggestions = buildCodeReviewUiSuggestions();

  let usedFallbackAnalysis = false;
  let markdown = "";
  let strategy = heuristicStrategy(d7);
  let uncertainty: string[] = [];
  let modelName: string | null = null;
  let promptTokens: number | null = 0;
  let completionTokens: number | null = 0;
  let estimatedCostUsd: number | null = 0;

  const ai = await callOpenAiWeeklyReport({ d7, d28, uiSuggestions });
  if (ai.ok) {
    markdown = ai.markdown;
    strategy = ai.strategy;
    uncertainty = ai.uncertainty;
    modelName = ai.modelName;
    promptTokens = ai.promptTokens;
    completionTokens = ai.completionTokens;
    estimatedCostUsd = ai.estimatedCostUsd;
  } else {
    usedFallbackAnalysis = true;
    markdown = heuristicAnalysisMarkdown({ d7, d28 });
    uncertainty = [
      `AI分析失敗のためヒューリスティック: ${ai.error}`,
      d7.dataQuality === "insufficient" ? "サンプル不足" : "",
    ].filter(Boolean);
    modelName = "heuristic_fallback";
  }

  const { data: report, error: reportErr } = await supabaseAdmin
    .from("marketing_reports")
    .insert({
      report_kind: params.trigger === "manual" ? "manual" : "weekly",
      status: "ready",
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      metrics_snapshot: { d7, d28 },
      analysis_markdown: markdown,
      ui_suggestions: uiSuggestions,
      strategy_suggestions: strategy,
      uncertainty_notes: uncertainty,
      model_name: modelName,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      estimated_cost_usd: estimatedCostUsd,
      ai_run_id: runId,
    })
    .select("id")
    .single();

  if (reportErr || !report?.id) {
    await supabaseAdmin
      .from("marketing_ai_runs")
      .update({
        status: "failed",
        error_message: reportErr?.message || "report_insert_failed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return { ok: false, error: "report_insert_failed", detail: reportErr?.message };
  }

  let strategyId: string | undefined;
  // Create a draft strategy from suggestions; activate only if requested.
  const created = await createStrategyVersion({
    label: `週次改善 v from report ${report.id.slice(0, 8)}`,
    guidance: strategy,
    promptAddon: buildPromptAddonFromGuidance(strategy),
    sourceReportId: report.id,
    notes: usedFallbackAnalysis ? "heuristic/fallback analysis" : "ai analysis",
    activate: params.activateStrategy === true,
  });
  if (created.ok) strategyId = created.strategy.id;

  await supabaseAdmin
    .from("marketing_ai_runs")
    .update({
      status: "succeeded",
      model_name: modelName,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      estimated_cost_usd: estimatedCostUsd,
      finished_at: new Date().toISOString(),
      meta: {
        trigger: params.trigger,
        reportId: report.id,
        strategyId: strategyId ?? null,
        usedFallbackAnalysis,
        weeklyCronEnabled: isMarketingWeeklyCronEnabled(),
      },
    })
    .eq("id", runId);

  return {
    ok: true,
    reportId: report.id,
    strategyId,
    usedFallbackAnalysis,
  };
}
