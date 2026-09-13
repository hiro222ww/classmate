"use client";

import Link from "next/link";
import { DASH_CARD } from "@/components/dashboard/dashboardStyles";
import { MatchEntryButton } from "@/components/MatchEntryButton";
import type { AdmissionStatusNotice } from "@/lib/admissionJoinGate";

type JoinNewCardProps = {
  className?: string;
  /** Disables voice/chat match-join CTAs (not theme browse). */
  matchJoinDisabled?: boolean;
  /** @deprecated Use matchJoinDisabled */
  joinDisabled?: boolean;
  voiceBusy?: boolean;
  chatBusy?: boolean;
  voiceLabel?: string;
  chatLabel?: string;
  admissionStatusNotice?: AdmissionStatusNotice | null;
  onAdmissionRefresh?: () => void;
  themeSelectHref?: string;
  themeSelectLabel?: string;
  /** When set (without navigating), renders a button instead of a Link. */
  onThemeSelect?: () => void;
  onVoiceJoin: () => void;
  onChatJoin: () => void;
};

/** Home hero: voice is primary, chat secondary, with theme browsing below. */
export function JoinNewCard({
  className,
  matchJoinDisabled,
  joinDisabled = false,
  voiceBusy = false,
  chatBusy = false,
  voiceLabel = "通話で始める",
  chatLabel = "チャットで始める",
  admissionStatusNotice = null,
  onAdmissionRefresh,
  themeSelectHref,
  themeSelectLabel = "テーマを選ぶ",
  onThemeSelect,
  onVoiceJoin,
  onChatJoin,
}: JoinNewCardProps) {
  const sectionClass = ["cm-paper-card", "cm-home-talk-cta", className]
    .filter(Boolean)
    .join(" ");

  const blockMatchJoin = matchJoinDisabled ?? joinDisabled;
  const voiceDisabled = blockMatchJoin || voiceBusy || chatBusy;
  const chatDisabled = blockMatchJoin || chatBusy || voiceBusy;

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
      {admissionStatusNotice ? (
        <div
          className="cm-home-admission-status"
          role="status"
          style={{
            display: "grid",
            gap: 8,
            justifyItems: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color:
                admissionStatusNotice.kind === "error" ? "#b45309" : "#78716c",
              textAlign: "center",
              lineHeight: 1.45,
            }}
          >
            {admissionStatusNotice.text}
          </p>
          {admissionStatusNotice.kind === "error" && onAdmissionRefresh ? (
            <button
              type="button"
              className="cm-home-admission-refresh"
              onClick={onAdmissionRefresh}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid rgba(148, 163, 184, 0.45)",
                background: "#fff",
                fontSize: 12,
                fontWeight: 800,
                color: "#475569",
                cursor: "pointer",
              }}
            >
              更新
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        className="cm-home-dual-cta-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        <MatchEntryButton
          mode="voice"
          className="cm-home-voice-cta"
          onClick={onVoiceJoin}
          disabled={voiceDisabled}
        >
          {voiceBusy ? "参加中…" : voiceLabel}
        </MatchEntryButton>
        <MatchEntryButton
          mode="chat"
          className="cm-home-chat-cta"
          onClick={onChatJoin}
          disabled={chatDisabled}
        >
          {chatBusy ? "参加中…" : chatLabel}
        </MatchEntryButton>
      </div>
      {onThemeSelect ? (
        <button
          type="button"
          className="cm-home-theme-select"
          onClick={onThemeSelect}
        >
          {themeSelectLabel}
        </button>
      ) : themeSelectHref ? (
        <Link
          href={themeSelectHref}
          className="cm-home-theme-select"
        >
          {themeSelectLabel}
        </Link>
      ) : null}
    </section>
  );
}
