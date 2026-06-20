import Link from "next/link";

export default function PrivacyPage() {
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
        プライバシーポリシー
      </h1>

      <p style={{ marginBottom: 16 }}>
        classmate運営（以下「当方」）は、本サービス「classmate」（以下「本サービス」）における個人情報の取扱いについて、以下のとおり定めます。
      </p>

      <SectionTitle>1. 取得する情報</SectionTitle>
      <ul style={{ marginBottom: 16, paddingLeft: 24 }}>
        <li>端末識別子（deviceId）</li>
        <li>プロフィール情報（表示名、生年月日、性別、写真、趣味、自己紹介、年齢表示設定）</li>
        <li>マッチング・参加条件（年齢範囲設定等）</li>
        <li>通話・参加に関する技術情報（接続状態、セッションID、接続ログ等）</li>
        <li>チャット・掲示板投稿、黒板描画、通報内容</li>
        <li>Push通知トークン、User-Agent</li>
        <li>決済に関する情報（Stripe 上の顧客ID、プラン情報。カード番号は Stripe が保持）</li>
        <li>アクセスログ、IPアドレス等（ホスティング基盤上で生成される情報）</li>
      </ul>

      <SectionTitle>2. 利用目的</SectionTitle>
      <ul style={{ marginBottom: 16, paddingLeft: 24 }}>
        <li>本サービスの提供、本人確認、年齢条件の適用</li>
        <li>クラス参加、音声通話、チャット等の機能提供</li>
        <li>不正利用防止、通報対応、安全確保</li>
        <li>有料プランの提供、課金、サポート</li>
        <li>Push通知の送信</li>
        <li>サービス改善、障害対応、問い合わせ対応</li>
      </ul>

      <SectionTitle>3. 第三者提供・委託</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        当方は、サービス提供に必要な範囲で以下の外部サービスを利用します。
      </p>
      <ul style={{ marginBottom: 16, paddingLeft: 24 }}>
        <li>Supabase（データベース、ストレージ、Realtime）</li>
        <li>Vercel（ホスティング）</li>
        <li>Stripe（決済）</li>
        <li>Web Push 配信基盤</li>
        <li>STUN/TURN サーバー（音声通話接続）</li>
      </ul>

      <SectionTitle>4. 保存期間</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        プロフィール、参加履歴、通報内容等は、利用継続中および運営上必要な期間保存します。
        通話接続ログ等の技術ログは、原則90日以内を目安に保存します。
        通報内容は、対応完了後おおむね3年を目安に保存します。
        具体的な期間は、法令または運用上の必要に応じて変更される場合があります。
      </p>

      <SectionTitle>5. 削除・開示等</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        ユーザーから削除・訂正・利用停止等のご請求があった場合、当方所定の方法で確認のうえ対応します。
        お問い合わせ先は本ページ末尾をご覧ください。
      </p>

      <SectionTitle>6. 未成年者</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        本サービスは原則として18歳未満および高校生以下を対象としません。
        検証環境等で例外的に未成年利用を許可する場合でも、保護者同意等の追加措置を講じます。
      </p>

      <SectionTitle>7. 安全管理</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        当方は、個人情報への不正アクセス、漏えい、改ざん等を防止するため、合理的な安全管理措置を講じます。
        漏えい等が発生した場合は、法令に従い必要な対応を行います。
      </p>

      <SectionTitle>8. 改定</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        本ポリシーは必要に応じて改定されます。重要な変更がある場合は、本サービス上で告知します。
      </p>

      <SectionTitle>9. お問い合わせ</SectionTitle>
      <p style={{ marginBottom: 8 }}>
        個人情報の取扱いに関するお問い合わせ：
        <a href="mailto:classmate.app.team@gmail.com">classmate.app.team@gmail.com</a>
      </p>
      <p style={{ marginBottom: 16 }}>
        関連ページ：
        <Link href="/terms"> 利用規約</Link> /
        <Link href="/guidelines"> コミュニティガイドライン</Link>
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
