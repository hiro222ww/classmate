"use client";

import Link from "next/link";
import BottomSheet from "@/components/BottomSheet";

type RoomSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  profileHref: string;
  onLeaveClass: () => void;
  leaveBusy?: boolean;
};

/**
 * Waiting-room settings — profile + explicit class leave (not call exit).
 */
export function RoomSettingsSheet({
  open,
  onClose,
  profileHref,
  onLeaveClass,
  leaveBusy = false,
}: RoomSettingsSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="設定">
      <div className="cm-room-settings-list">
        <Link
          href={profileHref}
          className="cm-room-settings-row"
          onClick={onClose}
        >
          プロフィール編集
        </Link>
        <button
          type="button"
          className="cm-room-settings-row cm-room-settings-row--danger"
          disabled={leaveBusy}
          onClick={() => {
            onLeaveClass();
          }}
        >
          {leaveBusy ? "脱退中…" : "クラスを脱退"}
        </button>
      </div>
    </BottomSheet>
  );
}
