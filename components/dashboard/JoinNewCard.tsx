"use client";

import { DASH_CARD, PRIMARY_BTN } from "@/components/dashboard/dashboardStyles";

type JoinNewCardProps = {
  className?: string;
  quickJoinDisabled?: boolean;
  quickJoinBusy?: boolean;
  quickJoinLabel?: string;
  quickJoinHint?: string;
  onQuickJoin: () => void;
};

/** One-decision home CTA: single primary action, no secondary class browse. */
export function JoinNewCard({
  className,
  quickJoinDisabled = false,
  quickJoinBusy = false,
  quickJoinLabel = "最大5人で話す",
  quickJoinHint = "3人集まると通話開始",
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
    </section>
  );
}
