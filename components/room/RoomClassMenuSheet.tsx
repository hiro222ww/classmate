"use client";

import BottomSheet from "@/components/BottomSheet";

export type RoomMicDeviceOption = {
  deviceId: string;
  label: string;
};

type RoomClassMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  onLeaveClass: () => void;
  leaveBusy?: boolean;
  /** Optional mic picker — moved out of the always-visible call chrome. */
  micDevices?: RoomMicDeviceOption[];
  selectedMicId?: string;
  onSelectMicId?: (deviceId: string) => void;
};

/**
 * Class-scoped actions (+ optional voice input picker).
 * Account chrome uses HomeMenuSheet.
 */
export function RoomClassMenuSheet({
  open,
  onClose,
  onLeaveClass,
  leaveBusy = false,
  micDevices = [],
  selectedMicId = "",
  onSelectMicId,
}: RoomClassMenuSheetProps) {
  const showMicPicker =
    typeof onSelectMicId === "function" && micDevices.length > 0;

  return (
    <BottomSheet open={open} onClose={onClose} title="クラス">
      <div className="cm-room-settings-list">
        {showMicPicker ? (
          <label className="cm-room-settings-mic">
            <span className="cm-room-settings-mic-label">マイク</span>
            <select
              className="cm-room-settings-mic-select"
              value={selectedMicId}
              onChange={(e) => onSelectMicId?.(e.target.value)}
            >
              {micDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "マイク"}
                </option>
              ))}
            </select>
          </label>
        ) : null}

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
