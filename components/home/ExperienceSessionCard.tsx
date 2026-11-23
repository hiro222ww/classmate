"use client";

import type { ExperiencePhase } from "@/lib/experience/types";

export type ExperienceCardEvent = {
  id: string;
  title: string;
  startsAtLabelJst: string;
  endsAtLabelJst: string;
  memberCount: number;
  maxMembers: number;
};

type ExperienceSessionCardProps = {
  phase: ExperiencePhase;
  event: ExperienceCardEvent | null;
  busy?: boolean;
  joinDisabled?: boolean;
  onJoin?: () => void;
  onGoRandom?: () => void;
};

/**
 * Soft pastel card above random talk. Hidden when phase=hidden or no event.
 * Intentionally quieter than RandomTalkCta.
 */
export function ExperienceSessionCard({
  phase,
  event,
  busy = false,
  joinDisabled = false,
  onJoin,
  onGoRandom,
}: ExperienceSessionCardProps) {
  if (phase === "hidden" || !event) return null;

  const title = event.title || "期間限定の体験会";

  return (
    <section
      id="cm-home-experience"
      className="cm-experience-card"
      aria-label="期間限定の体験会"
    >
      <div className="cm-experience-card-banner">
        <span className="cm-experience-card-glyph" aria-hidden>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <div className="cm-experience-card-copy">
          <p className="cm-experience-card-kicker">期間限定</p>
          <h2 className="cm-experience-card-heading">{title}</h2>
          {phase === "upcoming" ? (
            <p className="cm-experience-card-desc">
              次回: {event.startsAtLabelJst}〜{event.endsAtLabelJst}（JST）
            </p>
          ) : null}
          {phase === "live" ? (
            <p className="cm-experience-card-desc">
              開催中 · 現在 {event.memberCount}/{event.maxMembers}人 · 1人から参加OK
            </p>
          ) : null}
          {phase === "full" ? (
            <p className="cm-experience-card-desc">
              満員です（{event.maxMembers}人）。ランダム通話もご利用ください。
            </p>
          ) : null}
        </div>
      </div>

      {phase === "live" ? (
        <div className="cm-experience-card-actions">
          <button
            type="button"
            className="cm-experience-card-primary"
            disabled={joinDisabled || busy}
            onClick={onJoin}
          >
            {busy ? "入室中…" : "体験会に参加"}
          </button>
        </div>
      ) : null}

      {phase === "full" ? (
        <div className="cm-experience-card-actions">
          <button
            type="button"
            className="cm-experience-card-secondary"
            onClick={onGoRandom}
          >
            ランダム通話へ
          </button>
        </div>
      ) : null}

      {phase === "upcoming" ? (
        <p className="cm-experience-card-note">
          開始時刻になると参加ボタンが表示されます。
        </p>
      ) : null}
    </section>
  );
}
