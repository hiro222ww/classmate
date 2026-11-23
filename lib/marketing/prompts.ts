import type { MarketingPostType } from "@/lib/marketing/types";

/**
 * Facts only — grounded in product copy (seo/about/home) and implemented features.
 * Do not invent usage metrics or unreleased capabilities.
 */
export const CLASSMATE_MARKETING_CONTEXT = `
Classmate（クラスメイト）は、同年代と気軽に通話できる音声コミュニティです（classmate-room.com）。
対象は18歳以上（高校生以下は利用不可）。テーマ別の少人数クラス（最大5人程度）で友だちづくりができます。
実装されている体験の例:
- ホームの「マイクラス」で参加中クラスを見る／作る・参加する
- 「ランダム通話」から気軽に通話／チャットへ入る（少人数・最大5人程度）
- 期間限定の体験会（暫定の時間帯イベント）がある場合のみ、告知用の開催日時を案内できる
- クラス内で友達を招待するリンクを共有できる
- 初回は表示名と年齢などの最小プロフィール登録から始める
注意（正確性）:
- 「3人集まらないと始まらない」等の古い説明は使わない（実装は少人数で入れる導線）
- 体験会は主力機能ではない。開催予定がないときは体験会を宣伝しない
- 実測のない参加人数・満席・開催実績を書かない
- 出会い目的・連絡先交換・オフ会誘導の表現は避ける（利用規約・ガイドラインの方針）
禁止: 実在しない体験談、架空の利用者数・口コミ、未実装機能、年齢詐称の示唆、押し売り、誇大な「すぐ友達ができる」断定。
トーン: 自然な話し言葉。広告っぽい羅列や「今すぐ登録！」連発は避ける。
`.trim();

export const POST_TYPE_BRIEF: Record<MarketingPostType, string> = {
  empathy:
    "共感型: つながりや雑談の寂しさに寄り添う。Classmate名は0〜1回。CTAは任意。",
  question:
    "質問型: 返信や交流を生む軽い問いかけ。答えやすい二択・体験質問。宣伝は控えめ。",
  intro:
    "サービス紹介型: Classmateが何の場かを短く事実ベースで。機能の羅列や料金断定はしない。",
  invite:
    "参加促進型: 通話体験へのやさしい誘い。通話相手が少ない初期でも「覗く」「短時間」などハードルを下げる。",
  story:
    "開発ストーリー型: 個人開発の背景・意図・進捗を一人称で。実績数値や架空エピソードは禁止。",
};

export function buildDailyGenerateSystemPrompt(params?: {
  strategyAddon?: string | null;
  charterAddon?: string | null;
}): string {
  const lines = [
    "あなたはClassmateのX（旧Twitter）投稿コピーライターです。",
    CLASSMATE_MARKETING_CONTEXT,
    "毎回ちょうど3件の投稿案を日本語で生成してください。",
    "各投稿は原則140文字以内。ハッシュタグは最大1個（なくてもよい）。URLは本文に含めない（別フィールドで管理）。",
    "3件の post_type は互いに異なること。候補: empathy / question / intro / invite / story。",
    "各投稿に purpose（目的）, target_audience（想定読者）, expected_action（期待する行動）, cta（行動喚起。不要なら空文字可）を付ける。",
    "AIっぽい定型（「〜してみませんか？」「素敵な」「いかがでしょうか」の連発）を避け、口語に寄せる。",
    "運営憲章（承認済み方針）に矛盾する文面は作らない。矛盾しそうなら表現を弱めるか避ける。",
  ];
  const charter = String(params?.charterAddon ?? "").trim();
  if (charter) lines.push(charter);
  const addon = String(params?.strategyAddon ?? "").trim();
  if (addon) lines.push(addon);
  return lines.join("\n");
}

export function buildDailyGenerateUserPrompt(params: {
  recentBodies: string[];
  jstDate: string;
  preferredTypes?: MarketingPostType[];
}): string {
  const avoid =
    params.recentBodies.length > 0
      ? `最近の投稿と内容が重ならないようにしてください:\n- ${params.recentBodies
          .slice(0, 12)
          .join("\n- ")}`
      : "まだ投稿履歴は少ないので、初見でも伝わるトーンで。";

  const typeHint =
    params.preferredTypes && params.preferredTypes.length > 0
      ? `できれば次のタイプを優先: ${params.preferredTypes.join(", ")}`
      : "タイプの偏りを避け、共感・質問・紹介・参加・開発ストーリーをローテーション。";

  return [
    `今日の日付（JST）: ${params.jstDate}`,
    typeHint,
    "方向性の例（そのまま使わず言い換える）:",
    "- 大人になると新しい友達を作る機会が減る",
    "- 誰かと話したいが電話する相手はいない",
    "- SNSでつながっていても声で話す機会は少ない",
    "- 少人数なら話しやすいかも、という期待",
    "- 個人で音声コミュニティを作っている理由",
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
        required: [
          "post_type",
          "body_text",
          "purpose",
          "target_audience",
          "expected_action",
          "cta",
        ],
        properties: {
          post_type: {
            type: "string",
            enum: ["empathy", "question", "intro", "invite", "story"],
          },
          body_text: { type: "string" },
          purpose: { type: "string" },
          target_audience: { type: "string" },
          expected_action: { type: "string" },
          cta: { type: "string" },
        },
      },
    },
  },
} as const;
