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

      <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        有料プランについて
      </h2>

      <p style={{ marginBottom: 16 }}>
        基本機能は無料で利用できますが、以下の追加機能はサブスクリプション型の有料サービスとして提供されます。
      </p>

      <ul style={{ marginBottom: 16, paddingLeft: 24 }}>
        <li>同時に参加できるクラス数の上限拡張（例：1→3または5クラス）</li>
        <li>特定テーマのクラスへの参加権限</li>
      </ul>

      <p style={{ marginBottom: 8, fontWeight: "bold" }}>料金例</p>
      <ul style={{ marginBottom: 16, paddingLeft: 24 }}>
        <li>クラス枠拡張プラン：月額 700円 / 1000円</li>
        <li>テーマプラン：月額 400円 / 800円 / 1200円</li>
      </ul>

      <p style={{ marginBottom: 16 }}>
        ※料金や提供内容は、今後変更される場合があります。
      </p>

      <p style={{ marginBottom: 16 }}>
        サブスクリプションは月額課金制で、購入時に即時課金され、以降は毎月同日に自動更新されます。
      </p>

      <p style={{ marginBottom: 24 }}>
        ユーザーはいつでもサブスクリプションを解約できます。解約後も現在の請求期間の終了までは引き続き利用でき、次回以降の請求は発生しません。
      </p>

      <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        返金ポリシー
      </h2>

      <p style={{ marginBottom: 16 }}>
        本サービスはデジタルサービスの性質上、原則として返金は行っておりません。
      </p>

      <p style={{ marginBottom: 24 }}>
        ただし、重大な不具合や決済上の問題が発生した場合には、内容を確認のうえ個別に対応する場合があります。
      </p>

      <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        安全性について
      </h2>

      <p style={{ marginBottom: 24 }}>
        ユーザーが安心して利用できるよう、通報機能やブロック機能などの安全対策を順次整備しています。
      </p>

      <p style={{ marginBottom: 24 }}>
        本サービスは継続的に機能改善およびアップデートを行っています。
      </p>

      <hr style={{ margin: "32px 0" }} />

      <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        運営情報
      </h2>

      <p style={{ marginBottom: 8 }}>運営：classmate運営</p>
      <p>
        お問い合わせ：
        <a href="mailto:classmate.app.team@gmail.com">
          classmate.app.team@gmail.com
        </a>
      </p>
    </main>
  );
}