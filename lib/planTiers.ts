/** テーマプラン表示名（ベータ期間中は機能差なし・応援額の違いのみ） */
export function topicSupportPlanName(amount: number) {
  switch (amount) {
    case 400:
      return "ベータプラン";
    case 800:
      return "応援プラン";
    case 1200:
      return "もっと応援プラン";
    default:
      if (amount >= 1200) return "もっと応援プラン";
      if (amount >= 800) return "応援プラン";
      if (amount >= 400) return "ベータプラン";
      return "無料";
  }
}

/** @deprecated UIでは topicSupportPlanName を使う */
export function tierName(price: number) {
  return topicSupportPlanName(price);
}

export const TOPIC_PLAN_BETA_INTRO =
  "ベータ期間中は、どのテーマプランでも利用できるテーマ・機能は同じです。金額の違いは、Classmateの開発継続を応援するための任意の支援額です。";

export const TOPIC_PLAN_SAME_ACCESS_NOTE =
  "ベータ期間中は利用できる内容は同じです。";

export const TOPIC_PLAN_BETA_DESCRIPTION: Record<400 | 800 | 1200, string> = {
  400: "現在公開中のテーマを利用できます。",
  800: "利用できる内容はベータプランと同じです。Classmateの開発継続を応援したい方向けです。",
  1200:
    "利用できる内容はベータプランと同じです。今後のテーマ追加・通話品質改善の開発支援になります。",
};

export function formatTopicPlanLine(supportAmount: number) {
  if (supportAmount <= 0) return "無料";
  return `${topicSupportPlanName(supportAmount)}（¥${supportAmount}/月）`;
}

/** クラス枠の表示用月額（Stripe 設定と About ページで一致させる） */
export const CLASS_SLOT_MONTHLY_YEN = {
  3: 700,
  5: 1000,
} as const;

export function formatClassSlotPrice(slots: 3 | 5) {
  return `¥${CLASS_SLOT_MONTHLY_YEN[slots]}/月`;
}

export function formatClassSlotPlanLine(slots: number) {
  if (slots === 3) return `3クラス（${formatClassSlotPrice(3)}）`;
  if (slots === 5) return `5クラス（${formatClassSlotPrice(5)}）`;
  if (slots <= 1) return "1クラス（無料枠）";
  return `${slots}クラス`;
}
