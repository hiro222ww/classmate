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
import {
  isMarketingPostType,
  type GeneratedPostDraft,
} from "@/lib/marketing/types";
import { truncateForX } from "@/lib/marketing/utm";

export type OpenAiGenerateResult = {
  ok: true;
  posts: GeneratedPostDraft[];
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  rawText: string;
} | {
  ok: false;
  error: string;
  detail?: string;
};

function parsePostsPayload(raw: unknown): GeneratedPostDraft[] | null {
  if (!raw || typeof raw !== "object") return null;
  const posts = (raw as { posts?: unknown }).posts;
  if (!Array.isArray(posts) || posts.length < 3) return null;

  const out: GeneratedPostDraft[] = [];
  for (const item of posts.slice(0, 3)) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (!isMarketingPostType(row.post_type)) return null;
    const body = truncateForX(String(row.body_text ?? ""));
    if (!body) return null;
    out.push({
      post_type: row.post_type,
      body_text: body,
      purpose: String(row.purpose ?? "").trim() || "認知・共感",
      target_audience:
        String(row.target_audience ?? "").trim() || "18歳以上の話し相手を探している人",
      cta: String(row.cta ?? "").trim() || "気になったらClassmateをのぞいてみて",
    });
  }
  return out.length === 3 ? out : null;
}

export async function generatePostsWithOpenAi(params: {
  recentBodies: string[];
  jstDate: string;
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
          { role: "system", content: buildDailyGenerateSystemPrompt() },
          {
            role: "user",
            content: buildDailyGenerateUserPrompt({
              recentBodies: params.recentBodies,
              jstDate: params.jstDate,
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
      return { ok: false, error: "openai_invalid_json", detail: content.slice(0, 200) };
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

/** Deterministic offline drafts so admin UI / CI work without an API key. */
export function buildTemplateFallbackPosts(jstDate: string): GeneratedPostDraft[] {
  return [
    {
      post_type: "empathy",
      body_text:
        "大人になると、新しい友だちを作る機会って意外と減る。誰かと気軽に話したいのに、電話する相手が思いつかない——そんな夜、ありませんか。",
      purpose: "共感・認知",
      target_audience: "新しいつながりが欲しい18歳以上",
      cta: "同じ感覚の人は、Classmateをのぞいてみて",
    },
    {
      post_type: "invite",
      body_text:
        "テキストのやり取りは続くのに、声で話す機会は少ない。同年代と少人数で通話できる場があるなら、一度だけ覗いてみてもいいかも。",
      purpose: "参加促進",
      target_audience: "雑談したいがきっかけがない人",
      cta: "気が向いたらClassmateへ",
    },
    {
      post_type: "intro",
      body_text: `Classmateは、同年代と気軽に通話できる音声コミュニティです（${jstDate}）。テーマ別の少人数クラスで、友だちづくりのきっかけを作れます。`,
      purpose: "サービス紹介",
      target_audience: "音声コミュニティを探している人",
      cta: "詳しくはプロフィールのリンクから",
    },
  ];
}
