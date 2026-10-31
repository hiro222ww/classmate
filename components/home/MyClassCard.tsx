"use client";

import type { JoinedClassRow } from "@/hooks/useJoinedClasses";
import { CmAvatar } from "@/components/ui/CmAvatar";
import { CmStatusPill } from "@/components/ui/CmStatusPill";

export type MyClassMemberPreview = {
  deviceId: string;
  displayName: string;
  photoPath?: string | null;
};

type MyClassCardProps = {
  row: JoinedClassRow;
  opening?: boolean;
  disabled?: boolean;
  members?: MyClassMemberPreview[];
  memberCount?: number;
  capacity?: number;
  onOpen: (row: JoinedClassRow) => void;
};

function coverTone(row: JoinedClassRow): string {
  const key = `${row.topicKey ?? ""} ${row.topicTitle ?? ""} ${row.name}`.toLowerCase();
  if (/game|ゲーム/.test(key)) return "game";
  if (/music|音楽|歌/.test(key)) return "music";
  if (/study|勉強|学習/.test(key)) return "study";
  if (/夜|night|まったり/.test(key)) return "night";
  return "default";
}

function statusTone(
  label: string,
  hasSession: boolean
): "online" | "brand" | "neutral" {
  if (/通話/.test(label)) return "online";
  if (/待機|募集|開催|入室/.test(label) || hasSession) return "brand";
  return "neutral";
}

/** Class card: cover tone, name, topic, avatars, count, status — minimal copy. */
export function MyClassCard({
  row,
  opening = false,
  disabled = false,
  members = [],
  memberCount,
  capacity = 5,
  onOpen,
}: MyClassCardProps) {
  const label = opening ? "入室中…" : row.statusLabel || "所属中";
  const tone = statusTone(label, Boolean(row.sessionId));
  const previews = members.filter((m) => Boolean(m.deviceId)).slice(0, 4);
  const count =
    typeof memberCount === "number" && memberCount >= 0
      ? memberCount
      : previews.length;
  const overflow = Math.max(0, count - previews.length);

  return (
    <button
      type="button"
      className={`cm-my-class-card cm-my-class-card--${coverTone(row)}`}
      disabled={disabled}
      onClick={() => onOpen(row)}
      aria-label={`${row.name}を開く`}
    >
      <div className="cm-my-class-card-cover" aria-hidden />
      <div className="cm-my-class-card-body">
        <div className="cm-my-class-card-title-row">
          <span className="cm-my-class-card-title">{row.name}</span>
          <CmStatusPill tone={tone}>{label}</CmStatusPill>
        </div>
        {row.topicTitle ? (
          <span className="cm-my-class-card-topic">{row.topicTitle}</span>
        ) : null}
        <div className="cm-my-class-card-meta">
          {previews.length > 0 ? (
            <div className="cm-my-class-card-avatars" aria-hidden>
              {previews.map((m) => (
                <CmAvatar
                  key={m.deviceId}
                  label={m.displayName || "?"}
                  photoPath={m.photoPath}
                  sizePx={24}
                  className="cm-my-class-card-avatar"
                />
              ))}
              {overflow > 0 ? (
                <span className="cm-my-class-card-avatar-more">+{overflow}</span>
              ) : null}
            </div>
          ) : (
            <span className="cm-my-class-card-cta">開く</span>
          )}
          <span className="cm-my-class-card-count">
            {count}/{capacity}人
          </span>
        </div>
      </div>
    </button>
  );
}
