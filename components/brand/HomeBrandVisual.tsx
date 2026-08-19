"use client";

import { HOME_INTRO } from "@/lib/seo";

type Props = {
  menuButton?: React.ReactNode;
};

/**
 * First-view brand header for the home page.
 * Character icon (apple-touch-icon) + "Classmate" wordmark + optional ☰.
 */
export function HomeBrandVisual({ menuButton }: Props) {
  return (
    <div
      className="cm-home-brand-visual cm-stagger-1"
      style={{
        display: "grid",
        gap: 8,
        minWidth: 0,
        maxWidth: "100%",
        padding: "16px 16px 14px",
        borderRadius: 22,
        background:
          "linear-gradient(180deg, rgba(238,246,255,0.92) 0%, rgba(204,251,241,0.55) 100%)",
      }}
    >
      {/* Top row: character + wordmark + ☰ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <img
          src="/apple-touch-icon.png"
          alt=""
          width={44}
          height={44}
          decoding="async"
          fetchPriority="high"
          aria-hidden
          style={{
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.8)",
            boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#1e3a5f",
              letterSpacing: 0.3,
              lineHeight: 1.1,
            }}
          >
            Classmate
          </span>
          <span
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 700,
              color: "#64748b",
              letterSpacing: "0.04em",
              marginTop: 1,
            }}
          >
            クラスメイト
          </span>
        </div>
        {menuButton}
      </div>

      {/* Intro text */}
      <p
        className="cm-home-brand-visual-intro cm-stagger-2"
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.6,
          fontWeight: 600,
          color: "var(--cm-text, #374151)",
          textAlign: "left",
        }}
      >
        {HOME_INTRO}
      </p>
    </div>
  );
}
