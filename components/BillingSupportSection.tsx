"use client";

import {
  BILLING_BETA_NOTICE,
  BILLING_CONTACT_HELP,
  BILLING_PORTAL_LOGIN_DETAIL,
  BILLING_PORTAL_LOGIN_INTRO,
  BILLING_PORTAL_LOGIN_LINK_LABEL,
  BILLING_SUPPORT_EMAIL,
  getStripePortalLoginUrl,
} from "@/lib/billingSupportCopy";

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 16,
  background: "#fff",
  display: "grid",
  gap: 12,
};

const mutedTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "#6b7280",
  lineHeight: 1.75,
};

type BillingSupportSectionProps = {
  showBetaNotice?: boolean;
  showPortalLogin?: boolean;
  showContact?: boolean;
  title?: string;
};

export function BillingSupportSection({
  showBetaNotice = true,
  showPortalLogin = true,
  showContact = true,
  title = "アプリに入れない場合の課金管理",
}: BillingSupportSectionProps) {
  const portalLoginUrl = getStripePortalLoginUrl();

  return (
    <>
      {showPortalLogin ? (
        <section style={cardStyle}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{title}</div>
            <p style={{ ...mutedTextStyle, marginTop: 8 }}>
              {BILLING_PORTAL_LOGIN_INTRO}
            </p>
            <p style={{ ...mutedTextStyle, marginTop: 8 }}>
              {BILLING_PORTAL_LOGIN_DETAIL}
            </p>
          </div>

          {portalLoginUrl ? (
            <a
              href={portalLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                width: "100%",
                boxSizing: "border-box",
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #111",
                background: "#fff",
                color: "#111",
                fontWeight: 900,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              {BILLING_PORTAL_LOGIN_LINK_LABEL}
            </a>
          ) : (
            <p style={{ ...mutedTextStyle, fontSize: 12 }}>
              課金管理ページへのリンクは現在準備中です。解約・プラン変更は下記メールでお問い合わせください。
            </p>
          )}
        </section>
      ) : null}

      {showContact ? (
        <section style={cardStyle}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>お問い合わせ</div>
          <p style={mutedTextStyle}>{BILLING_CONTACT_HELP}</p>
          <a
            href={`mailto:${BILLING_SUPPORT_EMAIL}`}
            style={{
              color: "#111",
              fontWeight: 900,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              fontSize: 14,
            }}
          >
            {BILLING_SUPPORT_EMAIL}
          </a>
        </section>
      ) : null}

      {showBetaNotice ? (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "#9ca3af",
            lineHeight: 1.7,
            padding: "0 4px",
          }}
        >
          {BILLING_BETA_NOTICE}
        </p>
      ) : null}
    </>
  );
}
