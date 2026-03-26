export default function AboutPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 20px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 16 }}>
        classmate について
      </h1>

      <p style={{ marginBottom: 16 }}>
        classmateは、オンライン上で複数人がクラス形式で音声通話を行い、交流できるWebサービスです。
      </p>

      <p style={{ marginBottom: 16 }}>
        ユーザーはテーマごとのクラスに参加し、最大5人程度のグループで自由に会話することができます。
      </p>

      <p style={{ marginBottom: 16 }}>
        本サービスはすべてオンライン上で提供されるデジタルサービスであり、物理的な商品の配送は行いません。
      </p>

      <p style={{ marginBottom: 16 }}>
        基本機能は無料で利用できますが、以下の追加機能はサブスクリプション型の有料サービスとして提供されます。
      </p>

      <ul style={{ marginBottom: 16, paddingLeft: 24 }}>
        <li>同時に参加できるクラス数の拡張</li>
        <li>特定テーマのクラスへの参加権限</li>
      </ul>

      <p style={{ marginBottom: 16 }}>
        サブスクリプションは月額課金制で、購入時に即時課金され、以降は毎月同日に自動更新されます。
      </p>

      <p style={{ marginBottom: 24 }}>
        ユーザーはいつでもサブスクリプションを解約することができ、解約後は次回以降の請求は行われません。
      </p>

      <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        返金ポリシー
      </h2>

      <p style={{ marginBottom: 16 }}>
        本サービスはデジタルコンテンツの性質上、原則として返金は行っておりません。
      </p>

      <p style={{ marginBottom: 24 }}>
        ただし、重大な不具合が発生した場合には、個別に対応する場合があります。
      </p>

      <p style={{ marginBottom: 24 }}>
        本サービスは現在開発中であり、内容は予告なく変更される場合があります。
      </p>

      <hr style={{ margin: "32px 0" }} />

      <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        運営情報
      </h2>

      <p>運営：classmate運営</p>
      <p>お問い合わせ：classmate.app.team@gmail.com</p>
    </main>
  );
}