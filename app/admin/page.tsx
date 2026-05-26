"use client";

export const dynamic = "force-dynamic";

const cards = [
  {
    title: "ルーム監視",
    desc: "現在のルーム、参加者、危険度を確認",
    href: "/admin/rooms",
  },
  {
    title: "通話管理",
    desc: "TURN率、失敗率、通話停止設定",
    href: "/admin/voice",
  },
  {
    title: "通報管理",
    desc: "通報内容の確認・対応状況の更新",
    href: "/admin/reports",
  },
  {
  title: "世界観 / テーマ / 全体設定",
  desc: "テーマ、入校時間、課金注意文の管理",
  href: "/admin/topics",
},
];

export default function AdminHomePage() {
  async function logout() {
    await fetch("/api/admin/logout", {
      method: "POST",
    });

    window.location.href = "/admin/login";
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: 20,
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 900,
              }}
            >
              classmate 管理
            </h1>

            <p
              style={{
                marginTop: 6,
                color: "#667085",
                fontSize: 13,
              }}
            >
              運営・監視・緊急操作の入口です。
            </p>
          </div>

          <button
            type="button"
            onClick={() => void logout()}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {cards.map((c) => (
            <button
              key={c.href}
              type="button"
              onClick={() =>
                (window.location.href = c.href)
              }
              style={{
                textAlign: "left",
                padding: 18,
                borderRadius: 18,
                border: "1px solid #e5e7eb",
                background: "#fff",
                boxShadow:
                  "0 8px 24px rgba(15,23,42,0.06)",
                cursor: "pointer",
                transition: "0.15s ease",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                }}
              >
                {c.title}
              </div>

              <div
                style={{
                  marginTop: 8,
                  color: "#667085",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {c.desc}
              </div>
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}