"use client";

import { MatchEntryButton } from "@/components/MatchEntryButton";
import type { AdmissionStatusNotice } from "@/lib/admissionJoinGate";

type RandomTalkCtaProps = {
  className?: string;
  heading?: string;
  subcopy?: string | null;
  matchJoinDisabled?: boolean;
  joinDisabled?: boolean;
  voiceBusy?: boolean;
  chatBusy?: boolean;
  voiceLabel?: string;
  chatLabel?: string;
  admissionStatusNotice?: AdmissionStatusNotice | null;
  onAdmissionRefresh?: () => void;
  onVoiceJoin: () => void;
  onChatJoin: () => void;
};

/** Gradient primary CTA card — voice first, chat secondary. */
export function RandomTalkCta({
  className,
  heading = "ランダム通話",
  subcopy = "今すぐ最大5人で話す",
  matchJoinDisabled,
  joinDisabled = false,
  voiceBusy = false,
  chatBusy = false,
  voiceLabel = "通話",
  chatLabel = "チャット",
  admissionStatusNotice = null,
  onAdmissionRefresh,
  onVoiceJoin,
  onChatJoin,
}: RandomTalkCtaProps) {
  const blockMatchJoin = matchJoinDisabled ?? joinDisabled;
  const voiceDisabled = blockMatchJoin || voiceBusy || chatBusy;
  const chatDisabled = blockMatchJoin || chatBusy || voiceBusy;

  return (
    <section
      id="cm-home-random"
      className={["cm-random-talk", "cm-random-talk--hero", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="cm-random-talk-banner">
        <span className="cm-random-talk-glyph" aria-hidden>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v3" />
            <path d="M8 21h8" />
          </svg>
        </span>
        <div className="cm-random-talk-banner-copy">
          <h2 className="cm-random-talk-heading">{heading}</h2>
          {subcopy ? <p className="cm-random-talk-desc">{subcopy}</p> : null}
        </div>
      </div>

      {admissionStatusNotice ? (
        <div className="cm-random-talk-status" role="status">
          <p>{admissionStatusNotice.text}</p>
          {admissionStatusNotice.kind === "error" && onAdmissionRefresh ? (
            <button
              type="button"
              className="cm-text-btn"
              onClick={onAdmissionRefresh}
            >
              更新
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="cm-random-talk-actions">
        <MatchEntryButton
          mode="voice"
          className="cm-home-voice-cta cm-random-talk-primary"
          onClick={onVoiceJoin}
          disabled={voiceDisabled}
        >
          {voiceBusy ? "参加中…" : voiceLabel}
        </MatchEntryButton>
        <MatchEntryButton
          mode="chat"
          className="cm-home-chat-cta cm-random-talk-secondary"
          onClick={onChatJoin}
          disabled={chatDisabled}
        >
          {chatBusy ? "参加中…" : chatLabel}
        </MatchEntryButton>
      </div>
    </section>
  );
}
