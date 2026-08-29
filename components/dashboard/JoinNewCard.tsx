"use client";

import Link from "next/link";
import { DASH_CARD, PRIMARY_BTN, SECONDARY_BTN } from "@/components/dashboard/dashboardStyles";

type JoinNewCardProps = {
  className?: string;
  quickJoinDisabled?: boolean;
  quickJoinBusy?: boolean;
  quickJoinLabel?: string;
  quickJoinHint?: string;
  themeSelectHref?: string;
  themeSelectLabel?: string;
  onQuickJoin: () => void;
};

/** One-decision home CTA: primary random talk + weaker theme-select link. */
export function JoinNewCard({
  className,
  quickJoinDisabled = false,
  quickJoinBusy = false,
  quickJoinLabel = "最大5人で話す",
  quickJoinHint = "3人集まると通話開始",
  themeSelectHref,
  themeSelectLabel = "テーマを選んで話す",
  onQuickJoin,
}: JoinNewCardProps) {
  const sectionClass = ["cm-paper-card", "cm-home-talk-cta", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={sectionClass}
      style={{
        ...DASH_CARD,
        padding: "20px 18px",
        display: "grid",
        gap: 12,
      }}
    >
      <button
        type="button"
        className="cm-cta-primary"
        onClick={onQuickJoin}
        disabled={quickJoinDisabled || quickJoinBusy}
        style={{
          ...PRIMARY_BTN,
          padding: "18px 20px",
          fontSize: 18,
          borderRadius: 16,
          minHeight: 56,
          opacity: quickJoinDisabled || quickJoinBusy ? 0.55 : 1,
          cursor:
            quickJoinDisabled || quickJoinBusy ? "not-allowed" : "pointer",
        }}
      >
        {quickJoinBusy ? "参加中…" : quickJoinLabel}
      </button>
      {quickJoinHint ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "#6b7280",
            textAlign: "center",
            lineHeight: 1.45,
          }}
        >
          {quickJoinHint}
        </p>
      ) : null}
      {themeSelectHref ? (
        <Link
          href={themeSelectHref}
          className="cm-cta-secondary cm-home-theme-select"
          style={{
            ...SECONDARY_BTN,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 800,
            borderRadius: 14,
            border: "1px solid rgba(148, 163, 184, 0.45)",
            background: "#fff",
            color: "#475569",
            boxShadow: "none",
          }}
        >
          {themeSelectLabel}
        </Link>
      ) : null}
    </section>
  );
}
