/** 管理画面の課金注意文デフォルト（app_settings.billing_notice） */
export const DEFAULT_BILLING_NOTICE_TEXT =
  "ベータ期間中は、どのテーマプランでも利用できるテーマ・機能は同じです。金額の違いは開発継続のための任意の支援額です。仕様変更や不具合対応により、一部機能が変更される場合があります。";

export type BillingNoticeSetting = {
  enabled: boolean;
  text: string;
};

export function normalizeBillingNotice(
  value: unknown
): BillingNoticeSetting {
  if (!value || typeof value !== "object") {
    return { enabled: true, text: DEFAULT_BILLING_NOTICE_TEXT };
  }
  const row = value as Record<string, unknown>;
  const text = String(row.text ?? "").trim();
  return {
    enabled: row.enabled !== false,
    text: text || DEFAULT_BILLING_NOTICE_TEXT,
  };
}
