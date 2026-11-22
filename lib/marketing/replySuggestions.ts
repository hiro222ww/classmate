import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  estimateOpenAiCostUsd,
  getMarketingOpenAiApiKey,
  getMarketingOpenAiModel,
} from "@/lib/marketing/config";
import { listActivePolicies } from "@/lib/marketing/operatingCharter/store";
import { checkTextAgainstCharter } from "@/lib/marketing/operatingCharter/compliance";
import { buildCharterPromptAddon } from "@/lib/marketing/operatingCharter/prompt";
import {
  fetchPublicXPost,
  parseXStatusUrl,
} from "@/lib/marketing/fetchPublicXPost";

export type ReplySuggestionStatus =
  | "pending"
  | "ready"
  | "posted"
  | "skipped"
  | "needs_body";

export type ReplyDraft = {
  text: string;
  naturalness_score: number;
  promo_score: number;
  notes?: string;
};

export type ReplySuggestionMetrics = {
  source_views?: number | null;
  profile_visits?: number | null;
  site_visits?: number | null;
  registrations?: number | null;
  call_started?: number | null;
  recorded_at?: string | null;
  notes?: string | null;
};

export type ReplySuggestionRow = {
  id: string;
  source_url: string;
  source_post_id: string | null;
  source_author: string | null;
  source_body: string | null;
  selection_reason: string;
  reply_drafts: ReplyDraft[];
  selected_draft_index: number | null;
  status: ReplySuggestionStatus;
  naturalness_score: number | null;
  promo_score: number | null;
  charter_compliance: "ok" | "needs_review" | null;
  charter_notes: string | null;
  evaluation_notes: string | null;
  utm_content: string | null;
  metrics: ReplySuggestionMetrics;
  posted_at: string | null;
  skipped_at: string | null;
  skip_reason: string | null;
  created_at: string;
  updated_at: string;
};

const PROMO_HINTS =
  /今すぐ登録|絶対|必ず|無料で友達|出会い目的|オフパコ|DMください|フォローして|いいねして|リンクから登録/i;
const NATURAL_HINTS =
  /わかる|それな|あるある|自分も|どうしてる|夜|雑談|声|通話|友だち|友達/;

export function evaluateReplyDraft(text: string): {
  naturalness_score: number;
  promo_score: number;
  notes: string[];
} {
  const body = String(text ?? "").trim();
  const notes: string[] = [];
  let naturalness = 55;
  let promo = 20;

  if (body.length < 8) {
    naturalness -= 25;
    notes.push("短すぎる");
  } else if (body.length > 180) {
    naturalness -= 10;
    notes.push("やや長い");
  }

  if (NATURAL_HINTS.test(body)) naturalness += 15;
  if (/https?:\/\//i.test(body) || /classmate-room\.com/i.test(body)) {
    promo += 35;
    naturalness -= 10;
    notes.push("URL含む（宣伝寄り）");
  }
  if (PROMO_HINTS.test(body)) {
    promo += 40;
    naturalness -= 20;
    notes.push("宣伝・誘導フレーズ");
  }
  if (/！{2,}|[!]{2,}/.test(body)) {
    promo += 10;
    notes.push("感嘆過多");
  }

  naturalness = Math.max(0, Math.min(100, naturalness));
  promo = Math.max(0, Math.min(100, promo));
  return { naturalness_score: naturalness, promo_score: promo, notes };
}

function jstDateStamp(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/-/g, "");
}

function utmForReply(id: string): string {
  const short = createHash("sha256").update(id).digest("hex").slice(0, 6);
  return `reply_${jstDateStamp()}_${short}`;
}

function asDrafts(raw: unknown): ReplyDraft[] {
  if (!Array.isArray(raw)) return [];
  const out: ReplyDraft[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = String(row.text ?? "").trim();
    if (!text) continue;
    const draft: ReplyDraft = {
      text: text.slice(0, 280),
      naturalness_score: Number(row.naturalness_score ?? 0),
      promo_score: Number(row.promo_score ?? 0),
    };
    if (row.notes) draft.notes = String(row.notes);
    out.push(draft);
  }
  return out;
}

function mapRow(row: Record<string, unknown>): ReplySuggestionRow {
  return {
    id: String(row.id),
    source_url: String(row.source_url),
    source_post_id: row.source_post_id ? String(row.source_post_id) : null,
    source_author: row.source_author ? String(row.source_author) : null,
    source_body: row.source_body ? String(row.source_body) : null,
    selection_reason: String(row.selection_reason ?? ""),
    reply_drafts: asDrafts(row.reply_drafts),
    selected_draft_index:
      typeof row.selected_draft_index === "number"
        ? row.selected_draft_index
        : row.selected_draft_index == null
          ? null
          : Number(row.selected_draft_index),
    status: String(row.status) as ReplySuggestionStatus,
    naturalness_score:
      row.naturalness_score == null ? null : Number(row.naturalness_score),
    promo_score: row.promo_score == null ? null : Number(row.promo_score),
    charter_compliance:
      row.charter_compliance === "ok" || row.charter_compliance === "needs_review"
        ? row.charter_compliance
        : null,
    charter_notes: row.charter_notes ? String(row.charter_notes) : null,
    evaluation_notes: row.evaluation_notes
      ? String(row.evaluation_notes)
      : null,
    utm_content: row.utm_content ? String(row.utm_content) : null,
    metrics:
      row.metrics && typeof row.metrics === "object"
        ? (row.metrics as ReplySuggestionMetrics)
        : {},
    posted_at: row.posted_at ? String(row.posted_at) : null,
    skipped_at: row.skipped_at ? String(row.skipped_at) : null,
    skip_reason: row.skip_reason ? String(row.skip_reason) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listReplySuggestions(params?: {
  status?: ReplySuggestionStatus | "open" | "all";
  limit?: number;
}): Promise<
  | { ok: true; suggestions: ReplySuggestionRow[] }
  | { ok: false; error: string; detail?: string; migrationHint?: string }
> {
  const limit = Math.min(Math.max(params?.limit ?? 40, 1), 100);
  let q = supabaseAdmin
    .from("marketing_reply_suggestions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  const status = params?.status ?? "open";
  if (status === "open") {
    q = q.in("status", ["pending", "ready", "needs_body"]);
  } else if (status !== "all") {
    q = q.eq("status", status);
  }

  const { data, error } = await q;
  if (error) {
    const missing = /relation .* does not exist|Could not find the table/i.test(
      error.message
    );
    return {
      ok: false,
      error: "list_failed",
      detail: error.message,
      migrationHint: missing
        ? "Apply supabase/migrations/20261122120000_marketing_reply_suggestions.sql"
        : undefined,
    };
  }
  return {
    ok: true,
    suggestions: (data ?? []).map((r) =>
      mapRow(r as Record<string, unknown>)
    ),
  };
}

async function generateDraftsWithOpenAi(params: {
  sourceBody: string;
  selectionReason: string;
}): Promise<
  | {
      ok: true;
      drafts: ReplyDraft[];
      modelName: string;
      estimatedCostUsd: number;
    }
  | { ok: false; error: string; detail?: string }
> {
  const apiKey = getMarketingOpenAiApiKey();
  if (!apiKey) return { ok: false, error: "openai_api_key_missing" };

  const policies = await listActivePolicies();
  const charterAddon = buildCharterPromptAddon(policies);
  const modelName = getMarketingOpenAiModel();

  const system = [
    "あなたはClassmate（同年代少人数の音声通話コミュニティ）のX運用アシスタントです。",
    "タスク: 公開ポストへの自然な返信案を日本語で3〜5本作る。",
    "禁止: 自動投稿・DM誘導・出会い目的・誇大広告・定型の宣伝連投・URLの連投。",
    "原則: 相手の文脈に寄り添う。製品紹介は必要最小限。URLは原則入れない。",
    "出力はJSONのみ: {\"drafts\":[{\"text\":\"...\",\"notes\":\"...\"}]}",
    charterAddon || "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `選定理由: ${params.selectionReason || "（未記入）"}`,
    "元ポスト本文:",
    params.sourceBody.slice(0, 1500),
    "",
    "返信案は3〜5本。各120字以内。押し売りしない。",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelName,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        error: "openai_http",
        detail: json?.error?.message || `HTTP ${res.status}`,
      };
    }
    const rawText = String(json?.choices?.[0]?.message?.content ?? "");
    let draftsRaw: Array<{ text?: string; notes?: string }> = [];
    try {
      const parsed = JSON.parse(rawText) as {
        drafts?: Array<{ text?: string; notes?: string }>;
      };
      draftsRaw = Array.isArray(parsed.drafts) ? parsed.drafts : [];
    } catch {
      return { ok: false, error: "openai_json_parse" };
    }
    const drafts: ReplyDraft[] = [];
    for (const d of draftsRaw.slice(0, 5)) {
      const text = String(d?.text ?? "").trim().slice(0, 280);
      if (!text) continue;
      const ev = evaluateReplyDraft(text);
      const note = [d?.notes, ...ev.notes].filter(Boolean).join("; ");
      const draft: ReplyDraft = {
        text,
        naturalness_score: ev.naturalness_score,
        promo_score: ev.promo_score,
      };
      if (note) draft.notes = note;
      drafts.push(draft);
    }
    if (drafts.length < 3) {
      return { ok: false, error: "openai_insufficient_drafts" };
    }
    const promptTokens = Number(json?.usage?.prompt_tokens ?? 0);
    const completionTokens = Number(json?.usage?.completion_tokens ?? 0);
    return {
      ok: true,
      drafts,
      modelName,
      estimatedCostUsd: estimateOpenAiCostUsd({
        promptTokens,
        completionTokens,
      }),
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: "openai_failed",
      detail: e instanceof Error ? e.message : "unknown",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function aggregateEvaluation(drafts: ReplyDraft[], policiesTextBlob: string) {
  const avgNatural =
    drafts.reduce((s, d) => s + d.naturalness_score, 0) / Math.max(drafts.length, 1);
  const avgPromo =
    drafts.reduce((s, d) => s + d.promo_score, 0) / Math.max(drafts.length, 1);
  const joined = drafts.map((d) => d.text).join("\n");
  // Charter check uses policies loaded separately in caller
  return {
    naturalness_score: Math.round(avgNatural),
    promo_score: Math.round(avgPromo),
    evaluation_notes: `avg_natural=${avgNatural.toFixed(0)} avg_promo=${avgPromo.toFixed(0)} blob_len=${policiesTextBlob.length}`,
  };
}

/**
 * Create or regenerate a reply suggestion from an X status URL.
 * Never posts to X. Requires source body (fetched or operator-provided).
 */
export async function upsertReplySuggestion(params: {
  sourceUrl: string;
  selectionReason?: string;
  sourceBody?: string | null;
  forceRegenerate?: boolean;
}): Promise<
  | { ok: true; suggestion: ReplySuggestionRow; detail?: string }
  | {
      ok: false;
      error: string;
      detail?: string;
      migrationHint?: string;
      needsBody?: boolean;
      sourceUrl?: string;
    }
> {
  const parsed = parseXStatusUrl(params.sourceUrl);
  if (!parsed) {
    return { ok: false, error: "invalid_x_status_url" };
  }

  let sourceBody = String(params.sourceBody ?? "").trim();
  let sourceAuthor: string | null = parsed.sourceAuthor;
  let fetchNote: string | undefined;

  if (!sourceBody) {
    const fetched = await fetchPublicXPost(parsed.sourceUrl);
    if (fetched.ok) {
      sourceBody = fetched.sourceBody;
      sourceAuthor = fetched.sourceAuthor;
      fetchNote = `fetched_via_${fetched.source}`;
    } else {
      // Persist a needs_body row so the operator can fill it later.
      const { data: existing } = await supabaseAdmin
        .from("marketing_reply_suggestions")
        .select("*")
        .eq("source_url", parsed.sourceUrl)
        .in("status", ["pending", "ready", "needs_body"])
        .maybeSingle();

      if (!existing) {
        const { error: insertErr } = await supabaseAdmin
          .from("marketing_reply_suggestions")
          .insert({
            source_url: parsed.sourceUrl,
            source_post_id: parsed.sourcePostId,
            source_author: sourceAuthor,
            source_body: null,
            selection_reason: String(params.selectionReason ?? "").trim(),
            reply_drafts: [],
            status: "needs_body",
            evaluation_notes: `fetch_failed:${fetched.error}`,
          });
        if (insertErr) {
          const missing =
            /relation .* does not exist|Could not find the table/i.test(
              insertErr.message
            );
          return {
            ok: false,
            error: "insert_failed",
            detail: insertErr.message,
            migrationHint: missing
              ? "Apply supabase/migrations/20261122120000_marketing_reply_suggestions.sql"
              : undefined,
          };
        }
      }

      return {
        ok: false,
        error: "source_body_required",
        detail: fetched.detail || fetched.error,
        needsBody: true,
        sourceUrl: parsed.sourceUrl,
      };
    }
  }

  const reason = String(params.selectionReason ?? "").trim();
  if (!reason) {
    return { ok: false, error: "selection_reason_required" };
  }

  const generated = await generateDraftsWithOpenAi({
    sourceBody,
    selectionReason: reason,
  });
  if (!generated.ok) {
    return {
      ok: false,
      error: generated.error,
      detail: generated.detail,
    };
  }

  const policies = await listActivePolicies();
  const charterChecks = generated.drafts.map((d) =>
    checkTextAgainstCharter({ text: d.text, policies })
  );
  const anyReview = charterChecks.some((c) => c.status === "needs_review");
  const charterNotes = charterChecks
    .flatMap((c) => c.conflicts.map((x) => x.reason))
    .slice(0, 8)
    .join("; ");
  const agg = aggregateEvaluation(
    generated.drafts,
    policies.map((p) => p.body).join(" ")
  );

  // Prefer lower promo + higher naturalness draft as default selection
  let selected = 0;
  let best = -Infinity;
  generated.drafts.forEach((d, i) => {
    const score = d.naturalness_score - d.promo_score;
    if (score > best) {
      best = score;
      selected = i;
    }
  });

  const payload = {
    source_url: parsed.sourceUrl,
    source_post_id: parsed.sourcePostId,
    source_author: sourceAuthor,
    source_body: sourceBody,
    selection_reason: reason,
    reply_drafts: generated.drafts,
    selected_draft_index: selected,
    status: "ready" as const,
    naturalness_score: agg.naturalness_score,
    promo_score: agg.promo_score,
    charter_compliance: anyReview ? ("needs_review" as const) : ("ok" as const),
    charter_notes: charterNotes || null,
    evaluation_notes: [agg.evaluation_notes, fetchNote, generated.modelName]
      .filter(Boolean)
      .join(" | "),
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabaseAdmin
    .from("marketing_reply_suggestions")
    .select("id, utm_content")
    .eq("source_url", parsed.sourceUrl)
    .in("status", ["pending", "ready", "needs_body"])
    .maybeSingle();

  let row: Record<string, unknown> | null = null;
  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from("marketing_reply_suggestions")
      .update({
        ...payload,
        utm_content: existing.utm_content || utmForReply(String(existing.id)),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      return { ok: false, error: "update_failed", detail: error.message };
    }
    row = data as Record<string, unknown>;
  } else {
    const { data, error } = await supabaseAdmin
      .from("marketing_reply_suggestions")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      const missing = /relation .* does not exist|Could not find the table/i.test(
        error.message
      );
      return {
        ok: false,
        error: "insert_failed",
        detail: error.message,
        migrationHint: missing
          ? "Apply supabase/migrations/20261122120000_marketing_reply_suggestions.sql"
          : undefined,
      };
    }
    row = data as Record<string, unknown>;
    if (row?.id && !row.utm_content) {
      const utm = utmForReply(String(row.id));
      const { data: withUtm } = await supabaseAdmin
        .from("marketing_reply_suggestions")
        .update({ utm_content: utm })
        .eq("id", row.id)
        .select("*")
        .single();
      if (withUtm) row = withUtm as Record<string, unknown>;
    }
  }

  return {
    ok: true,
    suggestion: mapRow(row!),
    detail: `cost_est_usd=${generated.estimatedCostUsd.toFixed(4)}`,
  };
}

export async function patchReplySuggestion(params: {
  id: string;
  action?: "posted" | "skipped" | "ready" | "select_draft";
  selectedDraftIndex?: number;
  skipReason?: string;
  metrics?: ReplySuggestionMetrics;
  selectionReason?: string;
  sourceBody?: string;
}): Promise<
  | { ok: true; suggestion: ReplySuggestionRow }
  | { ok: false; error: string; detail?: string }
> {
  const id = String(params.id ?? "").trim();
  if (!id) return { ok: false, error: "id_required" };

  const { data: current, error: loadErr } = await supabaseAdmin
    .from("marketing_reply_suggestions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return { ok: false, error: "load_failed", detail: loadErr.message };
  if (!current) return { ok: false, error: "not_found" };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.selectionReason != null) {
    patch.selection_reason = String(params.selectionReason).trim();
  }
  if (params.sourceBody != null) {
    patch.source_body = String(params.sourceBody).trim();
  }
  if (params.metrics) {
    const prev =
      current.metrics && typeof current.metrics === "object"
        ? (current.metrics as Record<string, unknown>)
        : {};
    const next: ReplySuggestionMetrics = { ...prev };
    for (const key of [
      "source_views",
      "profile_visits",
      "site_visits",
      "registrations",
      "call_started",
    ] as const) {
      if (params.metrics[key] !== undefined) {
        const v = params.metrics[key];
        next[key] = v == null || v === ("" as unknown) ? null : Number(v);
      }
    }
    if (params.metrics.notes !== undefined) {
      next.notes = params.metrics.notes;
    }
    next.recorded_at = new Date().toISOString();
    patch.metrics = next;
  }

  if (params.action === "select_draft") {
    const idx = Number(params.selectedDraftIndex);
    const drafts = asDrafts(current.reply_drafts);
    if (!Number.isInteger(idx) || idx < 0 || idx >= drafts.length) {
      return { ok: false, error: "invalid_draft_index" };
    }
    patch.selected_draft_index = idx;
  }

  if (params.action === "posted") {
    patch.status = "posted";
    patch.posted_at = new Date().toISOString();
    if (
      typeof params.selectedDraftIndex === "number" &&
      Number.isInteger(params.selectedDraftIndex)
    ) {
      patch.selected_draft_index = params.selectedDraftIndex;
    }
  }
  if (params.action === "skipped") {
    patch.status = "skipped";
    patch.skipped_at = new Date().toISOString();
    patch.skip_reason = String(params.skipReason ?? "").trim() || null;
  }
  if (params.action === "ready") {
    patch.status = "ready";
  }

  const { data, error } = await supabaseAdmin
    .from("marketing_reply_suggestions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return { ok: false, error: "update_failed", detail: error.message };
  return { ok: true, suggestion: mapRow(data as Record<string, unknown>) };
}

/** Compare organic posts vs reply suggestions for a window (measured only). */
export async function loadReplyExposureComparison(params?: {
  rangeDays?: number;
}): Promise<
  | {
      ok: true;
      rangeDays: number;
      organic: {
        posts: number;
        siteVisits: number;
        registrations: number;
        callStarted: number;
      };
      replies: {
        posted: number;
        skipped: number;
        ready: number;
        withSourceViews: number;
        sourceViewsSum: number | null;
        profileVisitsSum: number | null;
        siteVisitsSum: number | null;
        notes: string[];
      };
    }
  | { ok: false; error: string; detail?: string; migrationHint?: string }
> {
  const rangeDays = Math.min(Math.max(params?.rangeDays ?? 7, 1), 30);
  const start = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts, error: postsErr } = await supabaseAdmin
    .from("marketing_posts")
    .select("id, status, published_at, utm_content")
    .gte("published_at", start)
    .eq("status", "published");
  if (postsErr) {
    return { ok: false, error: "posts_query_failed", detail: postsErr.message };
  }

  const { data: visits } = await supabaseAdmin
    .from("page_visits")
    .select("utm_content, utm_source")
    .gte("visited_at", start)
    .eq("utm_source", "x")
    .limit(5000);

  const replyUtm = new Set<string>();
  const listed = await listReplySuggestions({ status: "all", limit: 100 });
  if (!listed.ok) return listed;
  const windowReplies = listed.suggestions.filter(
    (s) => s.created_at >= start || (s.posted_at && s.posted_at >= start)
  );
  for (const s of windowReplies) {
    if (s.utm_content) replyUtm.add(s.utm_content);
  }

  const visitRows = visits ?? [];
  const organicVisits = visitRows.filter(
    (v) => !replyUtm.has(String(v.utm_content ?? ""))
  ).length;
  const replyVisits = visitRows.filter((v) =>
    replyUtm.has(String(v.utm_content ?? ""))
  ).length;

  const notes: string[] = [];
  let sourceViewsSum = 0;
  let profileVisitsSum = 0;
  let siteVisitsSum = 0;
  let withSourceViews = 0;
  let hasSourceViews = false;
  let hasProfile = false;
  let hasSiteMetric = false;

  for (const s of windowReplies) {
    if (typeof s.metrics.source_views === "number") {
      hasSourceViews = true;
      withSourceViews += 1;
      sourceViewsSum += s.metrics.source_views;
    }
    if (typeof s.metrics.profile_visits === "number") {
      hasProfile = true;
      profileVisitsSum += s.metrics.profile_visits;
    }
    if (typeof s.metrics.site_visits === "number") {
      hasSiteMetric = true;
      siteVisitsSum += s.metrics.site_visits;
    } else if (s.utm_content) {
      // fall back to measured UTM visits for this reply
      const n = visitRows.filter(
        (v) => String(v.utm_content ?? "") === s.utm_content
      ).length;
      if (n > 0) {
        hasSiteMetric = true;
        siteVisitsSum += n;
      }
    }
  }
  if (!hasSourceViews) {
    notes.push("source_views 未記録（X Analytics手入力待ち）");
  }
  if (!hasProfile) {
    notes.push("profile_visits 未記録");
  }
  if (!hasSiteMetric && replyVisits === 0) {
    notes.push("返信経路のサイト流入はまだ計測なし");
  }

  return {
    ok: true,
    rangeDays,
    organic: {
      posts: (posts ?? []).length,
      siteVisits: organicVisits,
      registrations: 0, // filled by metrics dashboard; keep 0 rather than invent
      callStarted: 0,
    },
    replies: {
      posted: windowReplies.filter((s) => s.status === "posted").length,
      skipped: windowReplies.filter((s) => s.status === "skipped").length,
      ready: windowReplies.filter((s) =>
        ["ready", "pending", "needs_body"].includes(s.status)
      ).length,
      withSourceViews,
      sourceViewsSum: hasSourceViews ? sourceViewsSum : null,
      profileVisitsSum: hasProfile ? profileVisitsSum : null,
      siteVisitsSum: hasSiteMetric ? siteVisitsSum : replyVisits || null,
      notes,
    },
  };
}
