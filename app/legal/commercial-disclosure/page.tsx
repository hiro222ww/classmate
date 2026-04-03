import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Commercial disclosure",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CommercialDisclosurePage() {
  const sectionStyle: React.CSSProperties = {
    borderTop: "1px solid #f3f4f6",
    padding: "14px 0",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  };

  const dtStyle: React.CSSProperties = {
    fontWeight: 600,
    width: "200px",
    flexShrink: 0,
    color: "#6b7280",
  };

  const ddStyle: React.CSSProperties = {
    margin: 0,
    flex: 1,
    minWidth: 0,
    color: "#374151",
  };

  return (
    <main
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "24px 16px 56px",
        fontSize: 13,
        lineHeight: 1.9,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* タイトル（控えめ） */}
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          margin: 0,
          color: "#111827",
        }}
      >
        Commercial disclosure
      </h1>

      {/* サブタイトル消してOK（目立つ原因なので） */}

      <div style={{ marginTop: 20 }}>
        {/* ▼ 上はサービス情報系 */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Service</dt>
            <dd style={ddStyle}>
              classmate is an online voice communication service.
            </dd>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Price</dt>
            <dd style={ddStyle}>
              Prices are shown on each purchase page (tax included).
            </dd>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Payment</dt>
            <dd style={ddStyle}>
              Credit card (Stripe)
            </dd>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Billing</dt>
            <dd style={ddStyle}>
              Subscription is billed at signup and automatically renewed.
            </dd>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Cancellation</dt>
            <dd style={ddStyle}>
              You may cancel before the next billing date.
            </dd>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Refund</dt>
            <dd style={ddStyle}>
              Due to the nature of digital services, refunds are not provided.
            </dd>
          </div>
        </section>

        {/* ▼ 下に運営情報（目立たせない） */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Email</dt>
            <dd style={ddStyle}>
              support@classmate-app.com
            </dd>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Address</dt>
            <dd style={ddStyle}>
              Provided upon request without delay
            </dd>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Phone</dt>
            <dd style={ddStyle}>
              Provided upon request without delay
            </dd>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>Operator</dt>
            <dd style={ddStyle}>
              classmate（吉川 弘晃）
            </dd>
          </div>
        </section>
      </div>
    </main>
  );
}