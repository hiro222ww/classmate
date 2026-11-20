import type { MarketingPostType } from "@/lib/marketing/types";

export const CLASSMATE_MARKETING_CONTEXT = `
Classmate（クラスメイト）は、同年代と気軽に通話できる音声コミュニティです。
対象は18歳以上。テーマ別の少人数クラスで友だちづくりができます。
宣伝口調を抑え、押し売りや誇大表現を避けてください。
禁止: 実在しない体験談、架空の利用者実績、未実装機能の紹介、年齢詐称の示唆、他SNSへの誘導。
`.trim();

export const POST_TYPE_BRIEF: Record<MarketingPostType, string> = {
  empathy:
    "共感型: 大人の友だちづくりの寂しさ・話し相手がいない感覚に寄り添う。Classmate名は自然に1回まで。",
  invite:
    "参加促進型: 気軽に声で雑談してみよう、と優しいCTA。強制感のない誘い方。",
  intro:
    "サービス紹介型: Classmateが何の場かを短く説明。機能羅列や料金の断定はしない。",
};

export function buildDailyGenerateSystemPrompt(): string {
  return [
    "あなたはClassmateのSNS（X）投稿コピーライターです。",
    CLASSMATE_MARKETING_CONTEXT,
    "毎回ちょうど3件の投稿案を日本語で生成してください。",
    "各投稿は原則140文字以内。ハッシュタグは最大1個まで（なくてもよい）。",
    "3件は post_type が empathy / invite / intro を1件ずつ含むこと。",
    "purpose（投稿目的）, target_audience（想定読者）, cta（行動喚起）も各投稿に付けること。",
  ].join("\n");
}

export function buildDailyGenerateUserPrompt(params: {
  recentBodies: string[];
  jstDate: string;
}): string {
  const avoid =
    params.recentBodies.length > 0
      ? `最近の投稿と内容が重ならないようにしてください:\n- ${params.recentBodies
          .slice(0, 12)
          .join("\n- ")}`
      : "まだ投稿履歴は少ないので、初見でも伝わるトーンで。";

  return [
    `今日の日付（JST）: ${params.jstDate}`,
    "方向性の例（そのまま使わず、言い換える）:",
    "- 大人になると新しい友達を作る機会が減る",
    "- 誰かと話したいが電話する相手はいない",
    "- 同じ趣味の人と気軽に雑談したい",
    "- SNSでつながっていても声で話す機会は少ない",
    avoid,
    "JSONスキーマに厳密に従って3件を返してください。",
  ].join("\n");
}

export const GENERATED_POSTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["post_type", "body_text", "purpose", "target_audience", "cta"],
        properties: {
          post_type: {
            type: "string",
            enum: ["empathy", "invite", "intro"],
          },
          body_text: { type: "string" },
          purpose: { type: "string" },
          target_audience: { type: "string" },
          cta: { type: "string" },
        },
      },
    },
  },
} as const;
