"use client";

import Link from "next/link";
import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  lines?: string[];
  right?: React.ReactNode;
  children: React.ReactNode;

  onBack?: () => void;
  onStartCall?: () => void;
  startDisabled?: boolean;
  startLabel?: string;

  returnTo?: string;
};

export function ChalkboardRoomShell({
  title,
  subtitle,
  lines = ["通話を開始する際は、青いボタンを押してください"],
  right,
  children,
  onBack,
  onStartCall,
  startDisabled = false,
  startLabel = "通話を開始",
}: Props) {
  const subtitleText = subtitle ?? "";
  const hasSubtitle = subtitleText.length > 0;

  const moveHref = "/class/select";
  const homeHref = "/";

  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      {/* 上の操作バー */}
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

          <div
            style={{
              fontSize: 12,
              color: "#555",
              minHeight: 16,
              visibility: hasSubtitle ? "visible" : "hidden",
            }}
            suppressHydrationWarning
          >
            {subtitleText}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                background: "#f2f2f2",
                fontWeight: 900,
                fontSize: 13,
                border: "none",
                cursor: "pointer",
              }}
            >
              戻る
            </button>
          ) : null}

          {onStartCall ? (
            <button
              type="button"
              onClick={onStartCall}
              disabled={startDisabled}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                background: startDisabled ? "#d1d5db" : "#2563eb",
                color: "#fff",
                fontWeight: 900,
                fontSize: 13,
                border: "none",
                cursor: startDisabled ? "not-allowed" : "pointer",
                opacity: startDisabled ? 0.7 : 1,
              }}
            >
              {startLabel}
            </button>
          ) : null}

          <Link
            href={moveHref}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              background: "#f2f2f2",
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            移動
          </Link>

          <Link
            href={homeHref}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              background: "#f2f2f2",
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            ホーム
          </Link>

          {right}
        </div>
      </div>

      {/* 黒板 */}
      <div style={{ marginTop: 8 }}>
        <div
          style={{
            borderRadius: 18,
            padding: "14px 18px",
            background: "#0f2b1d",
            color: "#e9fff2",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
          }}
        >
          {/* タイトル（クラス名 + 人数） */}
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: 0.5,
            }}
          >
            {title}
          </div>

          {/* サブタイトル（人数・状態） */}
          {hasSubtitle && (
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                opacity: 0.85,
                fontWeight: 700,
              }}
            >
              {subtitleText}
            </div>
          )}

          {/* 案内文（ここを大きくした） */}
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {lines.map((t, i) => (
              <div
                key={i}
                style={{
                  fontSize: 15,          // ← ★ここ大きくした
                  fontWeight: 800,       // ← ★強調
                  lineHeight: 1.4,
                  opacity: 0.95,
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 中身 */}
      <section style={{ marginTop: 12, color: "#111" }}>
        {children}
      </section>
    </main>
  );
}