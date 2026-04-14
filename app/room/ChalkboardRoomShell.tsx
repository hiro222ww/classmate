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
  lines = ["通話を開始する際は，通話開始ボタン(青)を押してください"],
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

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              style={{
                display: "inline-block",
                padding: "8px 10px",
                borderRadius: 10,
                background: "#f2f2f2",
                color: "#111",
                textDecoration: "none",
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
                display: "inline-block",
                padding: "8px 10px",
                borderRadius: 10,
                background: startDisabled ? "#d1d5db" : "#2563eb",
                color: "#fff",
                textDecoration: "none",
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
            href={homeHref}
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

      <div style={{ marginTop: 8 }}>
        <div
          style={{
            borderRadius: 18,
            padding: "12px 16px",
            background: "#0f2b1d",
            color: "#e9fff2",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 0.2 }}>
              {title}
            </div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>board</div>
          </div>

          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {lines.map((t, i) => (
              <div
                key={i}
                style={{ fontSize: 12, lineHeight: 1.35, opacity: 0.95 }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <section style={{ marginTop: 10, color: "#111" }}>{children}</section>
    </main>
  );
}