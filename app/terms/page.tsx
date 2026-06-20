import Link from "next/link";

export default function TermsPage() {
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
        利用規約
      </h1>

      <p style={{ marginBottom: 16 }}>
        本利用規約（以下「本規約」）は、classmate運営（以下「当方」）が提供するWebサービス「classmate」（以下「本サービス」）の利用条件を定めるものです。
      </p>

      <SectionTitle>第1条（適用）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        本規約は、本サービスの利用に関する一切の関係に適用されます。ユーザーは本規約および
        <Link href="/privacy">プライバシーポリシー</Link>
        、
        <Link href="/guidelines">コミュニティガイドライン</Link>
        に同意のうえ本サービスを利用するものとします。
      </p>

      <SectionTitle>第2条（対象者）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        本サービスは、大学生・専門学生・社会人向けのテーマ別グループ音声交流サービスです。
        18歳未満および高校生以下の方は利用できません。
      </p>

      <SectionTitle>第3条（サービス内容）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        本サービスは、ユーザー同士がオンライン上でテーマ別クラス形式の音声通話を通じて交流できるサービスです。
        一部機能は有料のサブスクリプションとして提供されます。
      </p>

      <SectionTitle>第4条（禁止事項）</SectionTitle>
      <ul style={{ marginBottom: 16, paddingLeft: 24 }}>
        <li>出会い、恋愛、交際、性的な目的での利用</li>
        <li>連絡先（SNS ID、電話番号、メールアドレス等）の交換または交換の勧誘</li>
        <li>対面での待ち合わせ、会合、住所・学校名・駅名等の交換または誘導</li>
        <li>わいせつ、性的、暴力的、差別的、嫌がらせ的な発言・行為</li>
        <li>通話・画面の無断録音、録画、第三者への共有</li>
        <li>なりすまし、虚偽の年齢・性別・プロフィール登録</li>
        <li>法令または公序良俗に違反する行為</li>
        <li>他のユーザーへの迷惑行為</li>
        <li>サービスの運営を妨害する行為</li>
      </ul>

      <SectionTitle>第5条（モデレーション）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        当方は、通報内容の確認、調査、その他必要と判断した場合、警告、投稿削除、利用停止、BAN、アカウント削除、関係機関への連絡等の措置を取ることができます。
      </p>

      <SectionTitle>第6条（サブスクリプション）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        ユーザーはサブスクリプションに登録することで追加機能を利用できます。
        料金は登録時に課金され、その後は月額で自動更新されます。
        ユーザーはいつでも解約することができ、解約後は次回以降の請求は行われません。
      </p>

      <SectionTitle>第7条（返金）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        本サービスはデジタルコンテンツのため、原則として返金は行いません。
        ただし、重大な不具合がある場合は個別に対応する場合があります。
      </p>

      <SectionTitle>第8条（通信内容）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        音声通話の内容そのものは当方サーバーに保存しません。
        ただし、接続に必要な技術情報、通報内容、運営上必要なログを保存する場合があります。
      </p>

      <SectionTitle>第9条（サービスの変更・停止）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        当方は、事前の通知なく本サービスの内容を変更し、または提供を停止することがあります。
      </p>

      <SectionTitle>第10条（免責事項）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        当方は、本サービスの利用により生じた損害について、当方の故意または重過失による場合を除き、責任を負わないものとします。
      </p>

      <SectionTitle>第11条（規約の変更）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        当方は、必要に応じて本規約を変更することができます。変更後の規約は、本サービス上に掲載した時点から効力を生じるものとします。
      </p>

      <SectionTitle>第12条（お問い合わせ）</SectionTitle>
      <p style={{ marginBottom: 16 }}>
        本サービスに関するお問い合わせは、以下までお願いいたします。
      </p>

      <p>classmate.app.team@gmail.com</p>
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
