"use client";

import { DASH_CARD, PRIMARY_BTN } from "@/components/dashboard/dashboardStyles";
import { joinModeCopy } from "@/lib/joinMode";

type JoinNewCardProps = {
  className?: string;
  callDisabled?: boolean;
  callBusy?: boolean;
  callLabel?: string;
  callSubtitle?: string;
  chatDisabled?: boolean;
  chatLabel?: string;
  chatSubtitle?: string;
  onCallStart: () => void;
  onChatStart: () => void;
};

/** Home entry: primary call CTA + secondary chat CTA (future parallel modes). */
export function JoinNewCard({
  className,
  callDisabled = false,
  callBusy = false,
  callLabel,
  callSubtitle,
  chatDisabled = false,
  chatLabel,
  chatSubtitle,
  onCallStart,
  onChatStart,
}: JoinNewCardProps) {
  const copy = joinModeCopy("call");
  const sectionClass = ["cm-paper-card", "cm-home-talk-cta", className]
    .filter(Boolean)
    .join(" ");

  const mainCallLabel = callLabel ?? copy.callLabel;
  const mainCallSubtitle = callSubtitle ?? copy.callSubtitle;
  const subChatLabel = chatLabel ?? copy.chatLabel;
  const subChatSubtitle = chatSubtitle ?? copy.chatSubtitle;

  return (
    <section
      className={sectionClass}
      style={{
        ...DASH_CARD,
        padding: "20px 18px",
        display: "grid",
        gap: 14,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 800,
          color: "#64748b",
          textAlign: "center",
          letterSpacing: 0.02,
        }}
      >
        {copy.homeHeading}
      </h2>

      <div style={{ display: "grid", gap: 6 }}>
        <button
          type="button"
          className="cm-cta-primary cm-home-call-start"
          onClick={onCallStart}
          disabled={callDisabled || callBusy}
          style={{
            ...PRIMARY_BTN,
            padding: "18px 20px",
            fontSize: 18,
            borderRadius: 16,
            minHeight: 56,
            opacity: callDisabled || callBusy ? 0.55 : 1,
            cursor:
              callDisabled || callBusy ? "not-allowed" : "pointer",
          }}
        >
          {callBusy ? "参加中…" : mainCallLabel}
        </button>
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
          {mainCallSubtitle}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: 6,
          paddingTop: 4,
          borderTop: "1px solid rgba(148, 163, 184, 0.22)",
        }}
      >
        <button
          type="button"
          className="cm-cta-secondary cm-home-chat-start"
          onClick={onChatStart}
          disabled={chatDisabled}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            padding: "13px 16px",
            fontSize: 15,
            fontWeight: 800,
            borderRadius: 14,
            border: "1px solid rgba(148, 163, 184, 0.45)",
            background: "#fff",
            color: "#475569",
            boxShadow: "none",
            minHeight: 48,
            opacity: chatDisabled ? 0.55 : 1,
            cursor: chatDisabled ? "not-allowed" : "pointer",
          }}
        >
          {subChatLabel}
        </button>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
            textAlign: "center",
            lineHeight: 1.45,
          }}
        >
          {subChatSubtitle}
        </p>
      </div>
    </section>
  );
}
