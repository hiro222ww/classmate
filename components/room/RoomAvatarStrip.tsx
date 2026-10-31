"use client";

import MemberListAvatar from "@/components/MemberListAvatar";

export type RoomAvatarStripMember = {
  id: string;
  label: string;
  photoPath?: string | null;
  avatarUrl?: string | null;
  isMe?: boolean;
  badge?: string | null;
};

type Props = {
  members: RoomAvatarStripMember[];
  /** Total seats including empties (invite is extra). */
  capacity: number;
  onInvite?: () => void;
  inviteDisabled?: boolean;
  inviteLabel?: string;
  onMemberClick?: (member: RoomAvatarStripMember) => void;
  className?: string;
};

const AVATAR_PX = 56;

/**
 * Horizontal presence strip: filled avatars, empty placeholders, trailing invite.
 * Matches the reference room hero member row.
 */
export function RoomAvatarStrip({
  members,
  capacity,
  onInvite,
  inviteDisabled = false,
  inviteLabel = "招待",
  onMemberClick,
  className,
}: Props) {
  const safeCapacity = Math.max(1, Math.min(8, Math.floor(capacity) || 5));
  const shown = members.slice(0, safeCapacity);
  const emptyCount = Math.max(0, safeCapacity - shown.length);

  return (
    <div
      className={["cm-room-avatar-strip", className].filter(Boolean).join(" ")}
      role="list"
      aria-label="参加メンバー"
    >
      {shown.map((m) => (
        <button
          key={m.id}
          type="button"
          role="listitem"
          className={[
            "cm-room-avatar-chip",
            m.isMe ? "cm-room-avatar-chip--me" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={!onMemberClick}
          onClick={() => onMemberClick?.(m)}
        >
          <span className="cm-room-avatar-chip-face" aria-hidden>
            <MemberListAvatar
              photoPath={m.photoPath}
              avatarUrl={m.avatarUrl}
              label={m.label}
              sizePx={AVATAR_PX}
              isMe={Boolean(m.isMe)}
              eager
            />
          </span>
          <span className="cm-room-avatar-chip-name">{m.label}</span>
          {m.badge ? (
            <span className="cm-room-avatar-chip-badge">{m.badge}</span>
          ) : null}
        </button>
      ))}

      {onInvite ? (
        <button
          type="button"
          role="listitem"
          className="cm-room-avatar-chip cm-room-avatar-chip--invite"
          onClick={onInvite}
          disabled={inviteDisabled}
          aria-label={inviteLabel}
        >
          <span className="cm-room-avatar-chip-face cm-room-avatar-chip-face--invite">
            +
          </span>
          <span className="cm-room-avatar-chip-name">{inviteLabel}</span>
        </button>
      ) : null}

      {Array.from({ length: emptyCount }).map((_, i) => (
        <div
          key={`empty-${i}`}
          role="listitem"
          className="cm-room-avatar-chip cm-room-avatar-chip--empty"
          aria-hidden
        >
          <span className="cm-room-avatar-chip-face cm-room-avatar-chip-face--empty" />
          <span className="cm-room-avatar-chip-name">空席</span>
        </div>
      ))}
    </div>
  );
}
