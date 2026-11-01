"use client";

import BottomSheet from "@/components/BottomSheet";

type RoomClassMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  onLeaveClass: () => void;
  leaveBusy?: boolean;
};

/**
 * Class-scoped actions only (not account settings).
 * Account chrome uses HomeMenuSheet.
 */
export function RoomClassMenuSheet({
  open,
  onClose,
  onLeaveClass,
  leaveBusy = false,
}: RoomClassMenuSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="クラス">
      <div className="cm-room-settings-list">
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
