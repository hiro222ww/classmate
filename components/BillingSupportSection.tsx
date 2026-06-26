"use client";

import { HelpTip } from "@/components/HelpTip";
import {
  BILLING_BETA_NOTICE,
  BILLING_CONTACT_HELP,
  BILLING_CONTACT_INFO_ITEMS,
  BILLING_PORTAL_LOGIN_LINK_LABEL,
  BILLING_PORTAL_LOGIN_TOOLTIP,
  BILLING_PORTAL_SECTION_TITLE,
  BILLING_SUPPORT_EMAIL,
  BILLING_TROUBLES_SUMMARY,
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

const linkButtonStyle: React.CSSProperties = {
  display: "inline-block",
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid #111",
  background: "#fff",
  color: "#111",
  fontWeight: 900,
  textAlign: "center",
  textDecoration: "none",
  fontSize: 14,
};

const detailsStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: "12px 14px",
  background: "#fafafa",
};

const mutedTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "#6b7280",
  lineHeight: 1.7,
};

type BillingSupportSectionProps = {
  showPortalLogin?: boolean;
  showTroubles?: boolean;
  showBetaNotice?: boolean;
};

export function BillingSupportSection({
  showPortalLogin = true,
  showTroubles = true,
  showBetaNotice = true,
}: BillingSupportSectionProps) {
  const portalLoginUrl = getStripePortalLoginUrl();

  return (
    <section
      style={{ display: "grid", gap: 12 }}
      aria-label="課金サポート情報"
    >
      {showPortalLogin ? (
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 900, fontSize: 15 }}>
              {BILLING_PORTAL_SECTION_TITLE}
            </span>
            <HelpTip
              label="Stripe課金管理について"
              maxWidth={320}
              content={BILLING_PORTAL_LOGIN_TOOLTIP}
            />
          </div>

          {portalLoginUrl ? (
            <a
              href={portalLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={linkButtonStyle}
            >
              {BILLING_PORTAL_LOGIN_LINK_LABEL}
            </a>
          ) : (
            <HelpTip
              label="Stripe課金管理について"
              maxWidth={320}
              content={`Stripe の課金管理リンクは準備中です。${BILLING_TROUBLES_SUMMARY}をご確認ください。`}
            />
          )}
        </div>
      ) : null}

      {showBetaNotice ? (
        <div style={{ padding: "0 4px" }}>
          <HelpTip
            label="β期間中のご利用について"
            maxWidth={320}
            content={BILLING_BETA_NOTICE}
          />
        </div>
      ) : null}

      {showTroubles ? (
        <details style={detailsStyle}>
          <summary
            style={{
              fontWeight: 900,
              fontSize: 13,
              color: "#374151",
              cursor: "pointer",
              listStylePosition: "outside",
            }}
          >
            {BILLING_TROUBLES_SUMMARY}
          </summary>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <p style={mutedTextStyle}>{BILLING_PORTAL_LOGIN_TOOLTIP}</p>

            {portalLoginUrl ? (
              <a
                href={portalLoginUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...linkButtonStyle,
                  width: "auto",
                  display: "inline-block",
                  padding: "10px 14px",
                  fontSize: 13,
                }}
              >
                {BILLING_PORTAL_LOGIN_LINK_LABEL}
              </a>
            ) : null}

            <p style={mutedTextStyle}>{BILLING_CONTACT_HELP}</p>

            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12,
                color: "#6b7280",
                lineHeight: 1.6,
              }}
            >
              {BILLING_CONTACT_INFO_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <p style={{ ...mutedTextStyle, fontSize: 12 }}>
              お問い合わせ:{" "}
              <a
                href={`mailto:${BILLING_SUPPORT_EMAIL}`}
                style={{
                  color: "#374151",
                  fontWeight: 800,
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                {BILLING_SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </details>
      ) : null}
    </section>
  );
}
