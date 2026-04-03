import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Commercial disclosure",
  description: "Disclosure based on the Act on Specified Commercial Transactions",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CommercialDisclosurePage() {
  const sectionStyle: React.CSSProperties = {
    borderTop: "1px solid #e5e7eb",
    padding: "16px 0",
  };

  const dtStyle: React.CSSProperties = {
    fontWeight: 700,
    width: "220px",
    flexShrink: 0,
  };

  const ddStyle: React.CSSProperties = {
    margin: 0,
    lineHeight: 1.8,
  };

  return (
    <main
      style={{
        maxWidth: 840,
        margin: "0 auto",
        padding: "32px 20px 64px",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>
        Commercial disclosure
      </h1>

      <p style={{ marginTop: 8, color: "#666" }}>
        特定商取引法に基づく表記
      </p>

      <div style={{ marginTop: 24 }}>
        <section style={sectionStyle}>
          <dt style={dtStyle}>販売事業者</dt>
          <dd style={ddStyle}>
            classmate運営（吉川 弘晃）
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>運営責任者</dt>
          <dd style={ddStyle}>
            吉川 弘晃
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>所在地</dt>
          <dd style={ddStyle}>
            請求があった場合、遅滞なく開示します。
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>電話番号</dt>
          <dd style={ddStyle}>
            請求があった場合、遅滞なく開示します。
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>メールアドレス</dt>
          <dd style={ddStyle}>
            support@classmate-app.com
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>販売価格</dt>
          <dd style={ddStyle}>
            各プランの購入ページに表示された金額（税込）によります。
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>商品代金以外の必要料金</dt>
          <dd style={ddStyle}>
            インターネット接続料金、通信料金等はお客様のご負担となります。
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>支払方法</dt>
          <dd style={ddStyle}>
            クレジットカード決済等（Stripe）
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>支払時期</dt>
          <dd style={ddStyle}>
            初回は申込時に課金されます。サブスクリプションは以後、各契約更新日に自動的に課金されます。
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>サービス提供時期</dt>
          <dd style={ddStyle}>
            決済手続完了後、直ちにご利用いただけます。
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>動作環境</dt>
          <dd style={ddStyle}>
            最新の主要ブラウザを搭載したスマートフォン、PCでの利用を推奨します。
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>解約について</dt>
          <dd style={ddStyle}>
            サブスクリプションは次回更新日前までに解約可能です。
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>返金について</dt>
          <dd style={ddStyle}>
            デジタルサービスの性質上、決済完了後の返金には原則対応しておりません。
          </dd>
        </section>

        <section style={sectionStyle}>
          <dt style={dtStyle}>サービス内容</dt>
          <dd style={ddStyle}>
            classmateはユーザー同士が音声で交流できるオンラインコミュニケーションサービスです。
          </dd>
        </section>
      </div>
    </main>
  );
}