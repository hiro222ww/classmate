// app/components/ClassBoard.tsx
"use client";

import React from "react";

export type Member = {
  id?: string;
  display_name?: string;
  avatar_url?: string | null;
  is_self?: boolean;
};

function Avatar({
  name,
  avatarUrl,
  dim,
}: {
  name: string;
  avatarUrl?: string | null;
  dim?: boolean;
}) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div
      title={name}
      style={{
        width: 48,
        height: 48,
        borderRadius: 999,
        border: "2px solid #1f2937",
        background: avatarUrl ? "transparent" : "#f3f4f6",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        fontWeight: 900,
        color: "#111",
        opacity: dim ? 0.45 : 1,
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ fontSize: 18 }}>{initial}</span>
      )}
    </div>
  );
}

export default function ClassBoard({
  title,
  subtitle,
  boardText,
  members,
  capacity = 2,
  rightMeta,
}: {
  title: string;
  subtitle?: string;
  boardText: string;
  members: Member[];
  capacity?: number;
  rightMeta?: React.ReactNode;
}) {
  const list = members ?? [];
  const missing = Math.max(0, capacity - list.length);

  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {/* ヘッダ */}
      <div
        style={{
          padding: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          borderBottom: "1px solid #eee",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#111" }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{subtitle}</div> : null}
        </div>
        {rightMeta ? <div style={{ fontSize: 12, color: "#6b7280" }}>{rightMeta}</div> : null}
      </div>

      {/* 黒板 */}
      <div style={{ padding: 14 }}>
        <div
          style={{
            background: "#0b3b2e",
            borderRadius: 16,
            padding: "16px 16px",
            border: "2px solid #073126",
            boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              color: "#e9fbe8",
              fontWeight: 900,
              letterSpacing: 0.2,
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              textShadow: "0 1px 0 rgba(0,0,0,0.25)",
            }}
          >
            {boardText}
          </div>
        </div>

        {/* 参加者列 */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#111" }}>
            参加者（{list.length}/{capacity}）
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {list.map((m, i) => (
              <div key={(m.id ?? m.display_name ?? "m") + i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Avatar
                  name={m.display_name ?? (m.is_self ? "あなた" : "参加者")}
                  avatarUrl={m.avatar_url ?? null}
                />
                <div style={{ fontSize: 11, color: "#374151", fontWeight: 900, textAlign: "center", width: 54 }}>
                  {m.display_name ?? (m.is_self ? "あなた" : "参加者")}
                </div>
              </div>
            ))}

            {Array.from({ length: missing }).map((_, i) => (
              <div key={"empty" + i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Avatar name="未参加" dim />
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 900, textAlign: "center", width: 54 }}>
                  未参加
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
