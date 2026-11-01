"use client";

import { CmAvatar } from "@/components/ui/CmAvatar";

type Props = {
  displayName: string;
  photoPath?: string | null;
  open?: boolean;
  onOpen: () => void;
  className?: string;
};

/** Frosted circular avatar for room/call hero — opens the shared account menu. */
export function RoomAccountAvatarButton({
  displayName,
  photoPath = null,
  open = false,
  onOpen,
  className,
}: Props) {
  return (
    <button
      type="button"
      className={[
        "cm-room-session-hero-account-btn",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="メニューを開く"
      aria-expanded={open}
      title="メニュー"
      onClick={onOpen}
    >
      <CmAvatar label={displayName || "ゲスト"} sizePx={32} photoPath={photoPath} />
    </button>
  );
}
