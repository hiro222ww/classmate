import Link from "next/link";

export default function GuidelinesPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 20px",
        lineHeight: 1.8,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 24 }}>
        コミュニティガイドライン
      </h1>

      <p style={{ marginBottom: 16 }}>
        Classmateは、テーマ別のグループ音声交流の場です。安心して利用していただくため、以下を守ってご利用ください。
      </p>

      <SectionTitle>対象者</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        大学生・専門学生・社会人向けです。高校生以下は利用できません。
      </p>

      <SectionTitle>してよいこと</SectionTitle>
      <ul style={{ marginBottom: 16, paddingLeft: 24 }}>
        <li>テーマに沿った会話、雑談、相談、情報交換</li>
        <li>クラス内での礼儀正しい交流</li>
        <li>困ったときの通報・ブロック機能の利用</li>
      </ul>

      <SectionTitle>してはいけないこと</SectionTitle>
      <ul style={{ marginBottom: 16, paddingLeft: 24 }}>
        <li>出会い、恋愛、交際、性的な目的での利用</li>
        <li>LINE、Instagram、X、Discord、電話番号、メール等の連絡先交換</li>
        <li>住所、学校名、駅名、待ち合わせ日時の交換や対面誘導</li>
        <li>わいせつ、性的、暴力的、差別的、嫌がらせ的な発言</li>
        <li>通話・画面の無断録音、録画、SNS等への投稿</li>
        <li>なりすまし、虚偽の年齢登録</li>
      </ul>

      <SectionTitle>困ったとき</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        不適切な言動に遭遇した場合は、通話画面またはルーム画面の通報・ブロック機能をご利用ください。
        必要に応じて運営が確認し、利用停止等の措置を取ります。
      </p>

      <SectionTitle>関連ドキュメント</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        <Link href="/terms">利用規約</Link> /
        <Link href="/privacy">プライバシーポリシー</Link>
      </p>

      <p style={{ marginBottom: 16 }}>
        お問い合わせ：
        <a href="mailto:classmate.app.team@gmail.com">classmate.app.team@gmail.com</a>
      </p>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 20,
        fontWeight: "bold",
        marginTop: 28,
        marginBottom: 12,
      }}
    >
      {children}
    </h2>
  );
}
