/** テーマプラン tier 名（400 / 800 / 1200） */
export function tierName(price: number) {
  switch (price) {
    case 1200:
      return "プレミアム";
    case 800:
      return "スタンダード";
    case 400:
      return "ベーシック";
    default:
      if (price >= 1200) return "プレミアム";
      if (price >= 800) return "スタンダード";
      if (price >= 400) return "ベーシック";
      return "無料";
  }
}

/** ベータ期間中に UI から新規購入できるテーマプラン（topic_plan ロジックは変更しない） */
export const BETA_AVAILABLE_TOPIC_PLAN = 400;

export const TOPIC_PLAN_BETA_DESCRIPTION: Record<400 | 800 | 1200, string> = {
  400: "現在：対象テーマ利用可能",
  800: "正式版に向けて準備中",
  1200: "正式版に向けて準備中",
};

export function formatTopicPlanLine(price: number) {
  if (price <= 0) return "無料";
  return `${tierName(price)}（¥${price}/月）`;
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
