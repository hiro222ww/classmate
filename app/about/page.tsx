export default function AboutPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 16 }}>
        classmate について
      </h1>

      <p style={{ marginBottom: 16 }}>
        classmateは、オンラインでクラス形式の音声コミュニケーションができるサービスです。
      </p>

      <p style={{ marginBottom: 16 }}>
        ユーザーはテーマごとのクラスに参加し、他のユーザーと自由に交流することができます。
      </p>

      <p style={{ marginBottom: 16 }}>
        一部の機能やクラスは、有料のサブスクリプションとして提供予定です。
      </p>

      <p style={{ marginBottom: 24 }}>
        本サービスは現在開発中です。
      </p>

      <hr style={{ margin: "32px 0" }} />

      <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        運営情報
      </h2>

      <p>運営：classmate運営</p>
      <p>お問い合わせ：your-email@gmail.com</p>
    </main>
  );
}