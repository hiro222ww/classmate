"use client";

import { HelpTip } from "@/components/HelpTip";
import { useBillingCopy } from "@/hooks/useBillingCopy";
import { getStripePortalLoginUrl } from "@/lib/billingSupportCopy";

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
  const { copy } = useBillingCopy();
  const support = copy.support;
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
              {support.sectionTitle}
            </span>
            <HelpTip
              label={support.portalTooltipLabel}
              maxWidth={320}
              content={support.portalTooltip}
            />
          </div>

          {portalLoginUrl ? (
            <a
              href={portalLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={linkButtonStyle}
            >
              {support.portalLoginLabel}
            </a>
          ) : (
            <HelpTip
              label={support.portalTooltipLabel}
              maxWidth={320}
              content={support.portalUnavailableSuffix}
            />
          )}
        </div>
      ) : null}

      {showBetaNotice ? (
        <div style={{ padding: "0 4px" }}>
          <HelpTip
            label={support.betaNoticeLabel}
            maxWidth={320}
            content={support.betaNotice}
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
            {support.troublesSummary}
          </summary>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <p style={mutedTextStyle}>{support.portalTooltip}</p>

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
                {support.portalLoginLabel}
              </a>
            ) : null}

            <p style={mutedTextStyle}>{support.contactHelp}</p>

            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12,
                color: "#6b7280",
                lineHeight: 1.6,
              }}
            >
              {support.contactInfoItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <p style={{ ...mutedTextStyle, fontSize: 12 }}>
              {support.contactEmailPrefix}{" "}
              <a
                href={`mailto:${support.supportEmail}`}
                style={{
                  color: "#374151",
                  fontWeight: 800,
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                {support.supportEmail}
              </a>
            </p>
          </div>
        </details>
      ) : null}
    </section>
  );
}
