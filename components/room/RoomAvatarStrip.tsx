"use client";

import { useMemo, useState, type CSSProperties } from "react";
import MemberListAvatar from "@/components/MemberListAvatar";
import {
  resolveRoomAvatarStripLayout,
  type RoomAvatarDensity,
} from "@/lib/roomAvatarStripLayout";

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
  /**
   * Session capacity (for invite disable / future UI only).
   * Empty seat placeholders are never rendered from this value.
   */
  capacity?: number;
  onInvite?: () => void;
  inviteDisabled?: boolean;
  inviteLabel?: string;
  onMemberClick?: (member: RoomAvatarStripMember) => void;
  /** Optional hook when +N is pressed (defaults to an inline roster popover). */
  onOverflowClick?: () => void;
  className?: string;
};

/**
 * Hero presence strip shared by waiting room + call.
 * Shows real members only (no empty seats). Invite is a separate control.
 */
export function RoomAvatarStrip({
  members,
  capacity,
  onInvite,
  inviteDisabled = false,
  inviteLabel = "＋招待",
  onMemberClick,
  onOverflowClick,
  className,
}: Props) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  const layout = useMemo(
    () =>
      resolveRoomAvatarStripLayout({
        memberCount: members.length,
      }),
    [members.length]
  );

  const shown = members.slice(0, layout.visibleCount);
  const overflowMembers = layout.showOverflow
    ? members.slice(layout.visibleCount)
    : [];
  const showInvite = typeof onInvite === "function";
  const atCapacity =
    Number.isFinite(Number(capacity)) &&
    members.length >= Math.max(1, Math.floor(Number(capacity)));

  const densityClass = densityToClass(layout.density);

  return (
    <div
      className={["cm-room-avatar-strip-wrap", className]
        .filter(Boolean)
        .join(" ")}
      data-density={layout.density}
      data-member-count={members.length}
      style={
        {
          ["--cm-avatar-px" as string]: `${layout.avatarPx}px`,
        } as CSSProperties
      }
    >
      <div
        className={["cm-room-avatar-strip", densityClass].filter(Boolean).join(" ")}
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
                sizePx={layout.avatarPx}
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

        {layout.showOverflow ? (
          <button
            type="button"
            className="cm-room-avatar-chip cm-room-avatar-chip--overflow"
            aria-label={`他${layout.overflowCount}人を表示`}
            aria-haspopup="dialog"
            aria-expanded={overflowOpen}
            onClick={() => {
              if (onOverflowClick) {
                onOverflowClick();
                return;
              }
              setOverflowOpen((v) => !v);
            }}
          >
            <span
              className="cm-room-avatar-chip-face cm-room-avatar-chip-face--overflow"
              aria-hidden
            >
              +{layout.overflowCount}
            </span>
            <span className="cm-room-avatar-chip-name">他の人</span>
          </button>
        ) : null}
      </div>

      {showInvite ? (
        <button
          type="button"
          className="cm-room-avatar-invite"
          onClick={onInvite}
          disabled={inviteDisabled || atCapacity}
          aria-label={inviteLabel}
          title={atCapacity ? "定員に達しています" : inviteLabel}
        >
          <span className="cm-room-avatar-invite-face" aria-hidden>
            +
          </span>
          <span className="cm-room-avatar-invite-label">招待</span>
        </button>
      ) : null}

      {overflowOpen && overflowMembers.length > 0 ? (
        <div
          className="cm-room-avatar-overflow-panel"
          role="dialog"
          aria-label="参加メンバー一覧"
        >
          <ul className="cm-room-avatar-overflow-list">
            {overflowMembers.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="cm-room-avatar-overflow-row"
                  disabled={!onMemberClick}
                  onClick={() => {
                    onMemberClick?.(m);
                    setOverflowOpen(false);
                  }}
                >
                  <MemberListAvatar
                    photoPath={m.photoPath}
                    avatarUrl={m.avatarUrl}
                    label={m.label}
                    sizePx={36}
                    isMe={Boolean(m.isMe)}
                  />
                  <span>{m.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="cm-room-avatar-overflow-close"
            onClick={() => setOverflowOpen(false)}
          >
            閉じる
          </button>
        </div>
      ) : null}
    </div>
  );
}

function densityToClass(density: RoomAvatarDensity): string {
  return `cm-room-avatar-strip--${density}`;
}
