import type { GeneratedPostDraft, MarketingPostType } from "@/lib/marketing/types";

export type QualityBreakdown = {
  naturalness: number;
  empathy: number;
  uniqueness: number;
  relevance: number;
  promoSoftness: number;
  accuracy: number;
  total: number;
  notes: string[];
  pass: boolean;
};

const AI_CLICHE_RE =
  /(いかがでしょうか|ぜひご活用|素敵な出会い|今すぐ登録|人生が変わる|絶対に|必ず友達|みんなやってる)/;

const HARD_PROMO_RE =
  /(今すぐ|無料登録|限定|爆伸び|神アプリ|最強|必ず|絶対)/;

const CLASSMATE_RE = /classmate|クラスメイト/i;

const FACT_UNSAFE_RE =
  /(利用者\d|登録者\d|\d+万人|\d+人が|口コミで|みんな使って|実績多数|3人集ま|自動開始|出会い目的|連絡先交換|オフ会)/;

export const QUALITY_PASS_THRESHOLD = 62;

export function scoreMarketingDraft(
  draft: GeneratedPostDraft,
  recentBodies: string[] = []
): QualityBreakdown {
  const notes: string[] = [];
  const body = draft.body_text.trim();
  const len = [...body].length;

  let naturalness = 70;
  let empathy = 55;
  let uniqueness = 70;
  let relevance = 55;
  let promoSoftness = 75;
  let accuracy = 80;

  if (len < 20) {
    naturalness -= 25;
    notes.push("短すぎる");
  } else if (len > 140) {
    naturalness -= 20;
    notes.push("140字超過");
  }

  if (AI_CLICHE_RE.test(body)) {
    naturalness -= 20;
    notes.push("AI定型・誇張表現");
  }

  if (draft.post_type === "empathy" || draft.post_type === "question") {
    empathy += /話|友|ひとり|寂しい|雑談|つなが/.test(body) ? 20 : 0;
  } else {
    empathy += 5;
  }

  if (recentBodies.some((r) => r && body && r.includes(body.slice(0, 20)))) {
    uniqueness -= 30;
    notes.push("最近の投稿と類似");
  }

  if (CLASSMATE_RE.test(body) || draft.post_type === "intro" || draft.post_type === "story") {
    relevance += 25;
  } else if (draft.post_type === "empathy" || draft.post_type === "question") {
    relevance += 10;
  }

  if (HARD_PROMO_RE.test(body)) {
    promoSoftness -= 25;
    notes.push("宣伝色が強い");
  }
  const hashCount = (body.match(/#/g) || []).length;
  if (hashCount > 1) {
    promoSoftness -= 15;
    notes.push("ハッシュタグ過多");
  }

  if (FACT_UNSAFE_RE.test(body)) {
    accuracy -= 40;
    notes.push("実績・口コミの断定が疑わしい");
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  naturalness = clamp(naturalness);
  empathy = clamp(empathy);
  uniqueness = clamp(uniqueness);
  relevance = clamp(relevance);
  promoSoftness = clamp(promoSoftness);
  accuracy = clamp(accuracy);

  const total = Math.round(
    naturalness * 0.2 +
      empathy * 0.15 +
      uniqueness * 0.15 +
      relevance * 0.2 +
      promoSoftness * 0.15 +
      accuracy * 0.15
  );

  const pass = total >= QUALITY_PASS_THRESHOLD && accuracy >= 50;

  return {
    naturalness,
    empathy,
    uniqueness,
    relevance,
    promoSoftness,
    accuracy,
    total,
    notes,
    pass,
  };
}

/** Rotate preferred types so daily batches do not stick to the same 3. */
export function preferredTypesForDay(jstDate: string): MarketingPostType[] {
  const day = Number(String(jstDate).replace(/\D/g, "").slice(-2)) || 1;
  const all: MarketingPostType[] = [
    "empathy",
    "question",
    "intro",
    "invite",
    "story",
  ];
  const start = day % all.length;
  return [all[start], all[(start + 1) % all.length], all[(start + 2) % all.length]];
}
