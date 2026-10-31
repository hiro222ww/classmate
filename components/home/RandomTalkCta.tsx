"use client";

import { MatchEntryButton } from "@/components/MatchEntryButton";
import type { AdmissionStatusNotice } from "@/lib/admissionJoinGate";

type RandomTalkCtaProps = {
  className?: string;
  heading?: string;
  description?: string;
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

/**
 * Compact random-talk strip — emphasized but not a huge card stack.
 */
export function RandomTalkCta({
  className,
  heading = "ランダム通話",
  description = "同年代と今すぐ話そう",
  matchJoinDisabled,
  joinDisabled = false,
  voiceBusy = false,
  chatBusy = false,
  voiceLabel = "通話で始める",
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
      className={["cm-random-talk", className].filter(Boolean).join(" ")}
    >
      <div className="cm-random-talk-copy">
        <h2 className="cm-random-talk-heading">{heading}</h2>
        <p className="cm-random-talk-desc">{description}</p>
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
