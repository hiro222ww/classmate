// app/room/ChalkboardRoomShell.tsx
import Link from "next/link";
import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  lines?: string[];
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function ChalkboardRoomShell({
  title,
  subtitle,
  lines = ["無言でもOK", "合わなければ移動してOK"],
  right,
  children,
}: Props) {
  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      {/* top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: "#111" }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 12, color: "#555" }}>{subtitle}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            href="/class/select"
            style={{
              display: "inline-block",
              padding: "8px 10px",
              borderRadius: 10,
              background: "#f2f2f2",
              color: "#111",
              textDecoration: "none",
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            移動
          </Link>

          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "8px 10px",
              borderRadius: 10,
              background: "#f2f2f2",
              color: "#111",
              textDecoration: "none",
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            ホーム
          </Link>

          {right}
        </div>
      </div>

      {/* chalkboard */}
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            borderRadius: 18,
            padding: 18,
            background: "#0f2b1d",
            color: "#e9fff2",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.2 }}>
              {title}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>board</div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {lines.map((t, i) => (
              <div
                key={i}
                style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.95 }}
              >
                ・{t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* content */}
      {/* ✅ ここで本文の文字色を強制的に黒系にする（globals.css が白文字でも読める） */}
      <section style={{ marginTop: 14, color: "#111" }}>{children}</section>
    </main>
  );
}
