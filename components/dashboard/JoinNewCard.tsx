"use client";

import Link from "next/link";
import { DASH_CARD, PRIMARY_BTN, SECONDARY_BTN } from "@/components/dashboard/dashboardStyles";

const EQUAL_CTA_STYLE: React.CSSProperties = {
  ...PRIMARY_BTN,
  padding: "16px 14px",
  fontSize: 16,
  borderRadius: 16,
  minHeight: 56,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  lineHeight: 1.35,
};

type JoinNewCardProps = {
  className?: string;
  joinDisabled?: boolean;
  voiceBusy?: boolean;
  chatBusy?: boolean;
  voiceLabel?: string;
  chatLabel?: string;
  themeSelectHref?: string;
  themeSelectLabel?: string;
  /** When set (without navigating), renders a button instead of a Link. */
  onThemeSelect?: () => void;
  onVoiceJoin: () => void;
  onChatJoin: () => void;
};

const THEME_SELECT_STYLE: React.CSSProperties = {
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
  width: "100%",
  cursor: "pointer",
};

/** Home hero: voice + chat at equal priority, theme select as sub-link below. */
export function JoinNewCard({
  className,
  joinDisabled = false,
  voiceBusy = false,
  chatBusy = false,
  voiceLabel = "🎙️ 通話から始める！",
  chatLabel = "💬 チャットから始める！",
  themeSelectHref,
  themeSelectLabel = "テーマを選んで始める",
  onThemeSelect,
  onVoiceJoin,
  onChatJoin,
}: JoinNewCardProps) {
  const sectionClass = ["cm-paper-card", "cm-home-talk-cta", className]
    .filter(Boolean)
    .join(" ");

  const voiceDisabled = joinDisabled || voiceBusy || chatBusy;
  const chatDisabled = joinDisabled || chatBusy || voiceBusy;

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
      <div
        className="cm-home-dual-cta-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        <button
          type="button"
          className="cm-cta-primary cm-home-voice-cta"
          onClick={onVoiceJoin}
          disabled={voiceDisabled}
          style={{
            ...EQUAL_CTA_STYLE,
            opacity: voiceDisabled ? 0.55 : 1,
            cursor: voiceDisabled ? "not-allowed" : "pointer",
          }}
        >
          {voiceBusy ? "参加中…" : voiceLabel}
        </button>
        <button
          type="button"
          className="cm-cta-primary cm-home-chat-cta"
          onClick={onChatJoin}
          disabled={chatDisabled}
          style={{
            ...EQUAL_CTA_STYLE,
            opacity: chatDisabled ? 0.55 : 1,
            cursor: chatDisabled ? "not-allowed" : "pointer",
          }}
        >
          {chatBusy ? "参加中…" : chatLabel}
        </button>
      </div>
      {onThemeSelect ? (
        <button
          type="button"
          className="cm-cta-secondary cm-home-theme-select"
          onClick={onThemeSelect}
          disabled={joinDisabled}
          style={{
            ...THEME_SELECT_STYLE,
            opacity: joinDisabled ? 0.55 : 1,
            cursor: joinDisabled ? "not-allowed" : "pointer",
          }}
        >
          {themeSelectLabel}
        </button>
      ) : themeSelectHref ? (
        <Link
          href={themeSelectHref}
          className="cm-cta-secondary cm-home-theme-select"
          style={THEME_SELECT_STYLE}
        >
          {themeSelectLabel}
        </Link>
      ) : null}
    </section>
  );
}
