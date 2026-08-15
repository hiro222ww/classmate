import type { Metadata } from "next";
import LegalPageShell from "@/components/legal/LegalPageShell";
import { NOINDEX_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記",
  description:
    "Classmate（クラスメイト）の特定商取引法に基づく表記です。販売事業者、料金、提供時期などの情報を掲載しています。",
  alternates: {
    canonical: "/legal/commercial-disclosure",
  },
  robots: NOINDEX_ROBOTS,
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
    <LegalPageShell>
      <h1
        className="cm-legal-title"
        style={{
          fontSize: 22,
          fontWeight: 600,
          margin: 0,
          color: "#111827",
        }}
      >
        Commercial disclosure
      </h1>

      <div className="cm-legal-disclosure" style={{ marginTop: 20 }}>
        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>サービス内容</dt>
            <dd style={ddStyle}>
              classmateはユーザー同士が音声で交流できるオンラインコミュニケーションサービスです。
            </dd>
          </div>
        </section>

        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>販売価格</dt>
            <dd style={ddStyle}>
              各プランの購入ページに表示された金額（税込）によります。
            </dd>
          </div>
        </section>

        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>支払方法</dt>
            <dd style={ddStyle}>クレジットカード決済（Stripe）</dd>
          </div>
        </section>

        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>支払時期</dt>
            <dd style={ddStyle}>
              初回は申込時に課金されます。以降は契約更新日に自動課金されます。
            </dd>
          </div>
        </section>

        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>解約について</dt>
            <dd style={ddStyle}>
              次回更新日前までに解約手続きを行うことで、以降の請求は停止されます。
            </dd>
          </div>
        </section>

        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>返金について</dt>
            <dd style={ddStyle}>
              デジタルサービスの性質上、決済完了後の返金には原則対応しておりません。
            </dd>
          </div>
        </section>

        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>メールアドレス</dt>
            <dd style={ddStyle}>classmate.app.team@gmail.com</dd>
          </div>
        </section>

        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>所在地</dt>
            <dd style={ddStyle}>請求があった場合、遅滞なく開示します。</dd>
          </div>
        </section>

        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>電話番号</dt>
            <dd style={ddStyle}>請求があった場合、遅滞なく開示します。</dd>
          </div>
        </section>

        <section className="cm-legal-disclosure-row" style={sectionStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>販売事業者</dt>
            <dd style={ddStyle}>吉川 弘晃</dd>
          </div>
        </section>
      </div>
    </LegalPageShell>
  );
}
