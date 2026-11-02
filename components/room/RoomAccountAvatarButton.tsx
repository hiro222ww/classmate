"use client";

import { CmAvatar } from "@/components/ui/CmAvatar";

type Props = {
  displayName: string;
  photoPath?: string | null;
  open?: boolean;
  onOpen: () => void;
  className?: string;
  /** True only when unread counts are known and > 0 (not push-OFF). */
  showUnreadDot?: boolean;
};

/** Frosted circular avatar for room/call hero — opens the shared account menu. */
export function RoomAccountAvatarButton({
  displayName,
  photoPath = null,
  open = false,
  onOpen,
  className,
  showUnreadDot = false,
}: Props) {
  return (
    <button
      type="button"
      className={[
        "cm-room-session-hero-account-btn",
        showUnreadDot ? "cm-account-avatar--unread" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        showUnreadDot ? "メニューを開く（未読あり）" : "メニューを開く"
      }
      aria-expanded={open}
      title="メニュー"
      onClick={onOpen}
    >
      <CmAvatar label={displayName || "ゲスト"} sizePx={32} photoPath={photoPath} />
      {showUnreadDot ? (
        <span className="cm-account-unread-dot" aria-hidden />
      ) : null}
    </button>
  );
}
