import {
  DEFAULT_BILLING_NOTICE_TEXT,
  normalizeBillingNotice,
  type BillingNoticeSetting,
} from "@/lib/billingNoticeDefaults";
import {
  BILLING_BETA_NOTICE,
  BILLING_CONTACT_HELP,
  BILLING_CONTACT_INFO_ITEMS,
  BILLING_PORTAL_LOGIN_LINK_LABEL,
  BILLING_PORTAL_LOGIN_TOOLTIP,
  BILLING_PORTAL_SECTION_TITLE,
  BILLING_SUPPORT_EMAIL,
  BILLING_TROUBLES_SUMMARY,
} from "@/lib/billingSupportCopy";
import {
  THEME_PLAN_TOPICS_CHANGE_NOTE,
  THEME_PLAN_TOPICS_HEADING,
  THEME_PLAN_TOPICS_INTRO,
} from "@/lib/topicManagement";

export type BillingCopySettings = {
  notice: {
    enabled: boolean;
    label: string;
    text: string;
  };
  premium: {
    topicPlanSectionTitle: string;
    topicPlanHelpLabel: string;
    topicPlanHelp: string;
    classSlotSectionTitle: string;
    classSlotHelpLabel: string;
    classSlotHelp: string;
  };
  themeTopics: {
    heading: string;
    helpLabel: string;
    intro: string;
    changeNote: string;
    emptyMessage: string;
  };
  billingPage: {
    titleHelpLabel: string;
    titleHelp: string;
  };
  support: {
    sectionTitle: string;
    portalTooltipLabel: string;
    portalTooltip: string;
    portalLoginLabel: string;
    portalUnavailableSuffix: string;
    betaNoticeLabel: string;
    betaNotice: string;
    troublesSummary: string;
    contactHelp: string;
    contactInfoItems: string[];
    supportEmail: string;
    contactEmailPrefix: string;
  };
};

export const DEFAULT_BILLING_COPY: BillingCopySettings = {
  notice: {
    enabled: true,
    label: "ベータ期間中のご利用について",
    text: DEFAULT_BILLING_NOTICE_TEXT,
  },
  premium: {
    topicPlanSectionTitle: "テーマプラン（任意の支援額）",
    topicPlanHelpLabel: "テーマプランについて",
    topicPlanHelp:
      "テーマプランは任意の月額支援です。金額が高いプランに追加機能があるわけではありません。",
    classSlotSectionTitle: "クラス枠",
    classSlotHelpLabel: "クラス枠について",
    classSlotHelp: "同時に参加できるクラス数の上限を拡張します。",
  },
  themeTopics: {
    heading: THEME_PLAN_TOPICS_HEADING,
    helpLabel: "テーマプランのテーマについて",
    intro: THEME_PLAN_TOPICS_INTRO,
    changeNote: THEME_PLAN_TOPICS_CHANGE_NOTE,
    emptyMessage: "現在公開中のテーマはありません。",
  },
  billingPage: {
    titleHelpLabel: "お支払い管理について",
    titleHelp: "プランの変更・解約は Stripe の画面で行います。",
  },
  support: {
    sectionTitle: BILLING_PORTAL_SECTION_TITLE,
    portalTooltipLabel: "Stripe課金管理について",
    portalTooltip: BILLING_PORTAL_LOGIN_TOOLTIP,
    portalLoginLabel: BILLING_PORTAL_LOGIN_LINK_LABEL,
    portalUnavailableSuffix:
      "Stripe の課金管理リンクは準備中です。課金状態が表示されない・解約できない場合をご確認ください。",
    betaNoticeLabel: "β期間中のご利用について",
    betaNotice: BILLING_BETA_NOTICE,
    troublesSummary: BILLING_TROUBLES_SUMMARY,
    contactHelp: BILLING_CONTACT_HELP,
    contactInfoItems: [...BILLING_CONTACT_INFO_ITEMS],
    supportEmail: BILLING_SUPPORT_EMAIL,
    contactEmailPrefix: "お問い合わせ:",
  },
};

function mergeString(
  value: unknown,
  fallback: string,
  { trim = true }: { trim?: boolean } = {}
): string {
  if (typeof value !== "string") return fallback;
  const next = trim ? value.trim() : value;
  return next || fallback;
}

function mergeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const items = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return items.length > 0 ? items : [...fallback];
}

export function normalizeBillingCopy(
  value: unknown,
  legacyNotice?: BillingNoticeSetting | null
): BillingCopySettings {
  const base = structuredClone(DEFAULT_BILLING_COPY);
  const row =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;

  const noticeRow =
    row?.notice && typeof row.notice === "object"
      ? (row.notice as Record<string, unknown>)
      : null;
  const legacy = normalizeBillingNotice(legacyNotice ?? null);

  base.notice = {
    enabled:
      noticeRow?.enabled !== undefined
        ? noticeRow.enabled !== false
        : legacy.enabled,
    label: mergeString(noticeRow?.label, base.notice.label),
    text: mergeString(noticeRow?.text, legacy.text, { trim: false }).trim()
      || base.notice.text,
  };

  const premiumRow =
    row?.premium && typeof row.premium === "object"
      ? (row.premium as Record<string, unknown>)
      : null;
  if (premiumRow) {
    base.premium = {
      topicPlanSectionTitle: mergeString(
        premiumRow.topicPlanSectionTitle,
        base.premium.topicPlanSectionTitle
      ),
      topicPlanHelpLabel: mergeString(
        premiumRow.topicPlanHelpLabel,
        base.premium.topicPlanHelpLabel
      ),
      topicPlanHelp: mergeString(
        premiumRow.topicPlanHelp,
        base.premium.topicPlanHelp,
        { trim: false }
      ),
      classSlotSectionTitle: mergeString(
        premiumRow.classSlotSectionTitle,
        base.premium.classSlotSectionTitle
      ),
      classSlotHelpLabel: mergeString(
        premiumRow.classSlotHelpLabel,
        base.premium.classSlotHelpLabel
      ),
      classSlotHelp: mergeString(
        premiumRow.classSlotHelp,
        base.premium.classSlotHelp,
        { trim: false }
      ),
    };
  }

  const themeTopicsRow =
    row?.themeTopics && typeof row.themeTopics === "object"
      ? (row.themeTopics as Record<string, unknown>)
      : null;
  if (themeTopicsRow) {
    base.themeTopics = {
      heading: mergeString(themeTopicsRow.heading, base.themeTopics.heading),
      helpLabel: mergeString(
        themeTopicsRow.helpLabel,
        base.themeTopics.helpLabel
      ),
      intro: mergeString(themeTopicsRow.intro, base.themeTopics.intro, {
        trim: false,
      }),
      changeNote: mergeString(
        themeTopicsRow.changeNote,
        base.themeTopics.changeNote,
        { trim: false }
      ),
      emptyMessage: mergeString(
        themeTopicsRow.emptyMessage,
        base.themeTopics.emptyMessage
      ),
    };
  }

  const billingPageRow =
    row?.billingPage && typeof row.billingPage === "object"
      ? (row.billingPage as Record<string, unknown>)
      : null;
  if (billingPageRow) {
    base.billingPage = {
      titleHelpLabel: mergeString(
        billingPageRow.titleHelpLabel,
        base.billingPage.titleHelpLabel
      ),
      titleHelp: mergeString(
        billingPageRow.titleHelp,
        base.billingPage.titleHelp,
        { trim: false }
      ),
    };
  }

  const supportRow =
    row?.support && typeof row.support === "object"
      ? (row.support as Record<string, unknown>)
      : null;
  if (supportRow) {
    base.support = {
      sectionTitle: mergeString(
        supportRow.sectionTitle,
        base.support.sectionTitle
      ),
      portalTooltipLabel: mergeString(
        supportRow.portalTooltipLabel,
        base.support.portalTooltipLabel
      ),
      portalTooltip: mergeString(
        supportRow.portalTooltip,
        base.support.portalTooltip,
        { trim: false }
      ),
      portalLoginLabel: mergeString(
        supportRow.portalLoginLabel,
        base.support.portalLoginLabel
      ),
      portalUnavailableSuffix: mergeString(
        supportRow.portalUnavailableSuffix,
        base.support.portalUnavailableSuffix,
        { trim: false }
      ),
      betaNoticeLabel: mergeString(
        supportRow.betaNoticeLabel,
        base.support.betaNoticeLabel
      ),
      betaNotice: mergeString(
        supportRow.betaNotice,
        base.support.betaNotice,
        { trim: false }
      ),
      troublesSummary: mergeString(
        supportRow.troublesSummary,
        base.support.troublesSummary
      ),
      contactHelp: mergeString(
        supportRow.contactHelp,
        base.support.contactHelp,
        { trim: false }
      ),
      contactInfoItems: mergeStringArray(
        supportRow.contactInfoItems,
        base.support.contactInfoItems
      ),
      supportEmail: mergeString(
        supportRow.supportEmail,
        base.support.supportEmail
      ),
      contactEmailPrefix: mergeString(
        supportRow.contactEmailPrefix,
        base.support.contactEmailPrefix
      ),
    };
  }

  return base;
}

export function billingNoticeFromCopy(
  copy: BillingCopySettings
): BillingNoticeSetting {
  return {
    enabled: copy.notice.enabled,
    text: copy.notice.text.trim() || DEFAULT_BILLING_NOTICE_TEXT,
  };
}
