// app/page.tsx
import HomeClient from "./HomeClient";

export default function HomePage() {
  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>classmate</h1>
        <span style={{ color: "#666", fontSize: 14 }}>判断を減らして、すぐ通話へ</span>
      </header>

      <section style={{ marginTop: 18 }}>
        <p style={{ margin: 0, color: "#444", lineHeight: 1.6 }}>
          迷ったら <b>フリークラス</b>（テーマ指定なし）でOK。
          <br />
          もっと濃い話題は <b>ボード</b> から入れます。
        </p>
      </section>

      <section style={{ marginTop: 18 }}>
        <HomeClient />
      </section>
    </main>
  );
}
