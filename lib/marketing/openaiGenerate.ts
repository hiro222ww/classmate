import {
  estimateOpenAiCostUsd,
  getMarketingOpenAiApiKey,
  getMarketingOpenAiModel,
} from "@/lib/marketing/config";
import {
  GENERATED_POSTS_JSON_SCHEMA,
  buildDailyGenerateSystemPrompt,
  buildDailyGenerateUserPrompt,
} from "@/lib/marketing/prompts";
import { preferredTypesForDay } from "@/lib/marketing/quality";
import {
  isMarketingPostType,
  type GeneratedPostDraft,
  type MarketingPostType,
} from "@/lib/marketing/types";
import { truncateForX } from "@/lib/marketing/utm";

export type OpenAiGenerateResult =
  | {
      ok: true;
      posts: GeneratedPostDraft[];
      modelName: string;
      promptTokens: number;
      completionTokens: number;
      estimatedCostUsd: number;
      rawText: string;
    }
  | {
      ok: false;
      error: string;
      detail?: string;
    };

function parsePostsPayload(raw: unknown): GeneratedPostDraft[] | null {
  if (!raw || typeof raw !== "object") return null;
  const posts = (raw as { posts?: unknown }).posts;
  if (!Array.isArray(posts) || posts.length < 3) return null;

  const out: GeneratedPostDraft[] = [];
  const seen = new Set<string>();
  for (const item of posts.slice(0, 3)) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (!isMarketingPostType(row.post_type)) return null;
    if (seen.has(row.post_type)) return null;
    seen.add(row.post_type);
    const body = truncateForX(String(row.body_text ?? ""));
    if (!body) return null;
    out.push({
      post_type: row.post_type,
      body_text: body,
      purpose: String(row.purpose ?? "").trim() || "認知",
      target_audience:
        String(row.target_audience ?? "").trim() ||
        "18歳以上の話し相手を探している人",
      expected_action:
        String(row.expected_action ?? "").trim() || "投稿に反応する",
      cta: String(row.cta ?? "").trim(),
    });
  }
  return out.length === 3 ? out : null;
}

async function callOpenAi(params: {
  recentBodies: string[];
  jstDate: string;
  preferredTypes?: MarketingPostType[];
  strategyAddon?: string | null;
  charterAddon?: string | null;
}): Promise<OpenAiGenerateResult> {
  const apiKey = getMarketingOpenAiApiKey();
  if (!apiKey) {
    return { ok: false, error: "openai_api_key_missing" };
  }

  const modelName = getMarketingOpenAiModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

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
        temperature: 0.85,
        messages: [
          {
            role: "system",
            content: buildDailyGenerateSystemPrompt({
              strategyAddon: params.strategyAddon,
              charterAddon: params.charterAddon,
            }),
          },
          {
            role: "user",
            content: buildDailyGenerateUserPrompt({
              recentBodies: params.recentBodies,
              jstDate: params.jstDate,
              preferredTypes: params.preferredTypes,
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "classmate_marketing_posts",
            strict: true,
            schema: GENERATED_POSTS_JSON_SCHEMA,
          },
        },
      }),
    });

    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!res.ok) {
      const errObj = json?.error as { message?: string } | undefined;
      return {
        ok: false,
        error: "openai_http_error",
        detail: errObj?.message || `HTTP ${res.status}`,
      };
    }

    const choices = json?.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;
    const content = choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return { ok: false, error: "openai_empty_content" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        ok: false,
        error: "openai_invalid_json",
        detail: content.slice(0, 200),
      };
    }

    const posts = parsePostsPayload(parsed);
    if (!posts) {
      return { ok: false, error: "openai_schema_mismatch" };
    }

    const usage = json?.usage as
      | { prompt_tokens?: number; completion_tokens?: number }
      | undefined;
    const promptTokens = Number(usage?.prompt_tokens ?? 0) || 0;
    const completionTokens = Number(usage?.completion_tokens ?? 0) || 0;

    return {
      ok: true,
      posts,
      modelName,
      promptTokens,
      completionTokens,
      estimatedCostUsd: estimateOpenAiCostUsd({ promptTokens, completionTokens }),
      rawText: content,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "openai_fetch_failed";
    return {
      ok: false,
      error: message.includes("abort") ? "openai_timeout" : "openai_fetch_failed",
      detail: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generatePostsWithOpenAi(params: {
  recentBodies: string[];
  jstDate: string;
  strategyAddon?: string | null;
  charterAddon?: string | null;
  preferredTypes?: MarketingPostType[];
  /** When true and first batch fails quality, retry once (counts toward budget in caller). */
  allowOneRetry?: boolean;
}): Promise<OpenAiGenerateResult & { retried?: boolean }> {
  const preferred =
    params.preferredTypes && params.preferredTypes.length > 0
      ? params.preferredTypes.slice(0, 3)
      : preferredTypesForDay(params.jstDate);
  const first = await callOpenAi({
    recentBodies: params.recentBodies,
    jstDate: params.jstDate,
    preferredTypes: preferred,
    strategyAddon: params.strategyAddon,
    charterAddon: params.charterAddon,
  });
  if (!first.ok || !params.allowOneRetry) return first;

  // Quality-aware single retry is applied in generatePosts.ts to respect budget.
  return first;
}

/** Deterministic offline drafts so admin UI / CI work without an API key. */
export function buildTemplateFallbackPosts(jstDate: string): GeneratedPostDraft[] {
  const preferred = preferredTypesForDay(jstDate);
  const library: Record<MarketingPostType, GeneratedPostDraft> = {
    empathy: {
      post_type: "empathy",
      body_text:
        "大人になると、新しい友だちを作る機会って意外と減る。誰かと気軽に話したいのに、電話する相手が思いつかない——そんな夜、ありませんか。",
      purpose: "共感・認知",
      target_audience: "新しいつながりが欲しい18歳以上",
      expected_action: "いいね・共感リプ",
      cta: "",
    },
    question: {
      post_type: "question",
      body_text:
        "ひとりの夜、どっち？ A) 誰かと話したいけど相手がいない B) 話したい気持ちがわかない",
      purpose: "交流のきっかけ",
      target_audience: "夜にTLを見る同年代",
      expected_action: "A/Bでリプライ",
      cta: "",
    },
    intro: {
      post_type: "intro",
      body_text: `Classmateは、同年代と気軽に通話できる音声コミュニティです。テーマ別の少人数クラスで友だちづくりのきっかけを作れます（${jstDate}）。`,
      purpose: "サービス紹介",
      target_audience: "音声コミュニティを探している人",
      expected_action: "プロフィールやリンクを開く",
      cta: "詳しくはプロフィールのリンクから",
    },
    invite: {
      post_type: "invite",
      body_text:
        "テキストのやり取りは続くのに、声で話す機会は少ない。同年代と少人数なら、一度だけ覗いてみてもいいかも。無理に長く居なくて大丈夫。",
      purpose: "通話体験の促進",
      target_audience: "雑談したいがきっかけがない人",
      expected_action: "サイトを開く・通話を試す",
      cta: "気が向いたらClassmateへ",
    },
    story: {
      post_type: "story",
      body_text:
        "声で話す場が少ないのが気になって、同年代向けの通話コミュニティを個人で作っています。Classmate。まだ初期ですが、少しずつ整えています。",
      purpose: "開発背景の共有",
      target_audience: "個人開発や新サービスに関心がある人",
      expected_action: "フォロー",
      cta: "",
    },
  };

  return preferred.map((t) => library[t]);
}
