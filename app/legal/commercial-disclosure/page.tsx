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

  const jaStyle: React.CSSProperties = {
    fontSize: 11,
    color: "#9ca3af",
    marginLeft: 6,
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

      <div style={{ marginTop: 20 }}>
        {/* サービス */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Service <span style={jaStyle}>サービス内容</span>
            </dt>
            <dd style={ddStyle}>
              classmate is an online voice communication service.
            </dd>
          </div>
        </section>

        {/* 価格 */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Price <span style={jaStyle}>価格</span>
            </dt>
            <dd style={ddStyle}>
              Prices are shown on each purchase page (tax included).
            </dd>
          </div>
        </section>

        {/* 支払い */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Payment <span style={jaStyle}>支払方法</span>
            </dt>
            <dd style={ddStyle}>
              Credit card (Stripe)
            </dd>
          </div>
        </section>

        {/* 課金 */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Billing <span style={jaStyle}>支払時期</span>
            </dt>
            <dd style={ddStyle}>
              Subscription is billed at signup and automatically renewed.
            </dd>
          </div>
        </section>

        {/* 解約 */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Cancellation <span style={jaStyle}>解約</span>
            </dt>
            <dd style={ddStyle}>
              You may cancel before the next billing date.
            </dd>
          </div>
        </section>

        {/* 返金 */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Refund <span style={jaStyle}>返金</span>
            </dt>
            <dd style={ddStyle}>
              Due to the nature of digital services, refunds are not provided.
            </dd>
          </div>
        </section>

        {/* 連絡 */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Email <span style={jaStyle}>メール</span>
            </dt>
            <dd style={ddStyle}>
              support@classmate-app.com
            </dd>
          </div>
        </section>

        {/* 住所 */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Address <span style={jaStyle}>所在地</span>
            </dt>
            <dd style={ddStyle}>
              Provided upon request without delay
            </dd>
          </div>
        </section>

        {/* 電話 */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Phone <span style={jaStyle}>電話番号</span>
            </dt>
            <dd style={ddStyle}>
              Provided upon request without delay
            </dd>
          </div>
        </section>

        {/* ▼ 名前だけ完全分離（目立たない最下部） */}
        <section style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>
              Operator <span style={jaStyle}>事業者</span>
            </dt>
            <dd style={ddStyle}>
              吉川 弘晃
            </dd>
          </div>
        </section>
      </div>
    </main>
  );
}