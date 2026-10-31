"use client";

import type { JoinedClassRow } from "@/hooks/useJoinedClasses";
import { CmStatusPill } from "@/components/ui/CmStatusPill";

type MyClassCardProps = {
  row: JoinedClassRow;
  opening?: boolean;
  disabled?: boolean;
  onOpen: (row: JoinedClassRow) => void;
};

/** Gradient fallback when class has no custom cover image. */
const COVER_GRADIENT =
  "linear-gradient(135deg, #dbeafe 0%, #e7f2ff 42%, #ffe8e8 100%)";

export function MyClassCard({
  row,
  opening = false,
  disabled = false,
  onOpen,
}: MyClassCardProps) {
  const inCall =
    Boolean(row.sessionId) ||
    /通話|募集|開催|入室/.test(String(row.statusLabel || ""));

  return (
    <button
      type="button"
      className="cm-my-class-card"
      disabled={disabled}
      onClick={() => onOpen(row)}
      aria-label={`${row.name}を開く`}
    >
      <div
        className="cm-my-class-card-cover"
        style={{ background: COVER_GRADIENT }}
        aria-hidden
      />
      <div className="cm-my-class-card-body">
        <div className="cm-my-class-card-title-row">
          <span className="cm-my-class-card-title">{row.name}</span>
          <CmStatusPill tone={inCall ? "online" : "neutral"}>
            {opening ? "入室中…" : row.statusLabel || "所属中"}
          </CmStatusPill>
        </div>
        {row.topicTitle ? (
          <span className="cm-my-class-card-topic">{row.topicTitle}</span>
        ) : null}
        <span className="cm-my-class-card-cta">
          {opening ? "入室中…" : "開く"}
        </span>
      </div>
    </button>
  );
}
