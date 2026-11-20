import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getMarketingDailyBudgetUsd,
  getMarketingDailyRunLimit,
} from "@/lib/marketing/config";
import {
  buildTemplateFallbackPosts,
  generatePostsWithOpenAi,
} from "@/lib/marketing/openaiGenerate";
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  maxSimilarityAgainst,
} from "@/lib/marketing/similarity";
import type { MarketingPostRow } from "@/lib/marketing/types";
import { buildMarketingTrackingUrl, truncateForX } from "@/lib/marketing/utm";

function jstDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function jstDayBoundsIso(d = new Date()): { startIso: string; endIso: string } {
  const day = jstDateString(d);
  // JST midnight ↔ next midnight as absolute instants
  const start = new Date(`${day}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export type GenerateMarketingPostsResult = {
  ok: boolean;
  error?: string;
  detail?: string;
  runId?: string;
  posts?: MarketingPostRow[];
  usedFallback?: boolean;
};

export async function generateMarketingPosts(params: {
  trigger: "daily_generate" | "manual_generate";
  allowTemplateFallback?: boolean;
}): Promise<GenerateMarketingPostsResult> {
  const allowFallback = params.allowTemplateFallback !== false;
  const jstDate = jstDateString();
  const { startIso, endIso } = jstDayBoundsIso();

  const { count: runCount, error: runCountError } = await supabaseAdmin
    .from("marketing_ai_runs")
    .select("id", { count: "exact", head: true })
    .gte("started_at", startIso)
    .lt("started_at", endIso)
    .neq("status", "skipped");

  if (runCountError) {
    return { ok: false, error: "run_limit_check_failed", detail: runCountError.message };
  }
  if ((runCount ?? 0) >= getMarketingDailyRunLimit()) {
    return { ok: false, error: "daily_run_limit_reached" };
  }

  const { data: costRows, error: costError } = await supabaseAdmin
    .from("marketing_ai_runs")
    .select("estimated_cost_usd")
    .gte("started_at", startIso)
    .lt("started_at", endIso)
    .eq("status", "succeeded");

  if (costError) {
    return { ok: false, error: "budget_check_failed", detail: costError.message };
  }

  const spent = (costRows ?? []).reduce(
    (sum, row) => sum + (Number(row.estimated_cost_usd) || 0),
    0
  );
  if (spent >= getMarketingDailyBudgetUsd()) {
    return { ok: false, error: "daily_budget_reached" };
  }

  const { data: recentRows, error: recentError } = await supabaseAdmin
    .from("marketing_posts")
    .select("body_text")
    .order("created_at", { ascending: false })
    .limit(40);

  if (recentError) {
    return { ok: false, error: "recent_posts_failed", detail: recentError.message };
  }

  const recentBodies = (recentRows ?? [])
    .map((r) => String(r.body_text ?? ""))
    .filter(Boolean);

  const { data: runRow, error: runInsertError } = await supabaseAdmin
    .from("marketing_ai_runs")
    .insert({
      run_kind: params.trigger,
      status: "running",
      meta: { jstDate },
    })
    .select("id")
    .single();

  if (runInsertError || !runRow?.id) {
    return {
      ok: false,
      error: "ai_run_insert_failed",
      detail: runInsertError?.message,
    };
  }

  const runId = runRow.id as string;
  const ai = await generatePostsWithOpenAi({ recentBodies, jstDate });

  let drafts = ai.ok ? ai.posts : null;
  let usedFallback = false;
  let modelName: string | null = ai.ok ? ai.modelName : null;
  let promptTokens: number | null = ai.ok ? ai.promptTokens : null;
  let completionTokens: number | null = ai.ok ? ai.completionTokens : null;
  let estimatedCostUsd: number | null = ai.ok ? ai.estimatedCostUsd : null;
  let generationSource: "openai" | "template_fallback" = "openai";

  if (!drafts) {
    if (!allowFallback) {
      await supabaseAdmin
        .from("marketing_ai_runs")
        .update({
          status: "failed",
          error_message: ai.ok ? "empty" : `${ai.error}:${ai.detail ?? ""}`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return {
        ok: false,
        error: ai.ok ? "empty_generation" : ai.error,
        detail: ai.ok ? undefined : ai.detail,
        runId,
      };
    }
    drafts = buildTemplateFallbackPosts(jstDate);
    usedFallback = true;
    generationSource = "template_fallback";
    modelName = "template_fallback";
    promptTokens = 0;
    completionTokens = 0;
    estimatedCostUsd = 0;
  }

  const inserts = [];
  for (const [idx, draft] of drafts.entries()) {
    let body = truncateForX(draft.body_text);
    let similarity = maxSimilarityAgainst(body, recentBodies);
    let attempts = 0;
    while (similarity >= DEFAULT_SIMILARITY_THRESHOLD && attempts < 3) {
      body = truncateForX(`${body} （別角度）`);
      similarity = maxSimilarityAgainst(body, recentBodies);
      attempts += 1;
    }

    const utmContent = `post_${jstDate.replace(/-/g, "")}_${idx + 1}`;
    const trackingUrl = buildMarketingTrackingUrl({
      channel: "x",
      campaign: "ai_marketing",
      content: utmContent,
    });

    inserts.push({
      channel: "x",
      post_type: draft.post_type,
      status: "draft",
      body_text: body,
      purpose: draft.purpose,
      target_audience: draft.target_audience,
      cta: draft.cta,
      utm_campaign: "ai_marketing",
      utm_content: utmContent,
      tracking_url: trackingUrl,
      generation_source: generationSource,
      similarity_score: Math.round(similarity * 1000) / 1000,
      model_name: modelName,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      estimated_cost_usd: estimatedCostUsd,
      ai_run_id: runId,
      updated_at: new Date().toISOString(),
    });

    recentBodies.unshift(body);
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from("marketing_posts")
    .insert(inserts)
    .select("*");

  if (insertError) {
    await supabaseAdmin
      .from("marketing_ai_runs")
      .update({
        status: "failed",
        error_message: insertError.message,
        model_name: modelName,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        estimated_cost_usd: estimatedCostUsd,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return { ok: false, error: "posts_insert_failed", detail: insertError.message, runId };
  }

  await supabaseAdmin
    .from("marketing_ai_runs")
    .update({
      status: "succeeded",
      model_name: modelName,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      estimated_cost_usd: estimatedCostUsd,
      posts_created: created?.length ?? 0,
      finished_at: new Date().toISOString(),
      meta: {
        jstDate,
        usedFallback,
        trigger: params.trigger,
        openaiError: ai.ok ? null : ai.error,
      },
    })
    .eq("id", runId);

  return {
    ok: true,
    runId,
    posts: (created ?? []) as MarketingPostRow[],
    usedFallback,
  };
}
