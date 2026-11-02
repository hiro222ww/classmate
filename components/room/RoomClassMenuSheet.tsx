"use client";

import { useEffect, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { ClassInfoEditSheet } from "@/components/room/ClassInfoEditSheet";
import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";

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
  classId?: string;
  deviceId?: string;
  classTitle?: string | null;
  systemClassName?: string | null;
  coverPath?: string | null;
  onClassPresentationSaved?: (next: {
    title: string;
    displayName: string | null;
    coverPath: string | null;
  }) => void;
};

/**
 * Class-scoped actions (+ optional voice input picker + gated presentation edit).
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
  classId = "",
  deviceId = "",
  classTitle = null,
  systemClassName = null,
  coverPath = null,
  onClassPresentationSaved,
}: RoomClassMenuSheetProps) {
  const showMicPicker =
    typeof onSelectMicId === "function" && micDevices.length > 0;

  const [editOpen, setEditOpen] = useState(false);
  const [editSupported, setEditSupported] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loadedTitle, setLoadedTitle] = useState<string | null>(null);
  const [loadedSystemName, setLoadedSystemName] = useState<string | null>(null);
  const [loadedCoverPath, setLoadedCoverPath] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !classId || !deviceId) {
      setEditSupported(false);
      setCanEdit(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const headers = await buildDeviceAuthHeaders(deviceId);
        const qs = new URLSearchParams({ classId, deviceId });
        const res = await fetch(`/api/class/presentation?${qs.toString()}`, {
          cache: "no-store",
          headers,
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        setEditSupported(json?.editSupported === true);
        setCanEdit(json?.canEdit === true);
        setLoadedTitle(
          json?.title != null ? String(json.title) : classTitle ?? null
        );
        setLoadedSystemName(
          json?.name != null ? String(json.name) : systemClassName ?? null
        );
        setLoadedCoverPath(
          json?.coverPath != null
            ? String(json.coverPath)
            : coverPath ?? null
        );
      } catch {
        if (!cancelled) {
          setEditSupported(false);
          setCanEdit(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, classId, deviceId, classTitle, systemClassName, coverPath]);

  return (
    <>
      <BottomSheet open={open && !editOpen} onClose={onClose} title="クラス">
        <div className="cm-room-settings-list">
          {editSupported && canEdit ? (
            <button
              type="button"
              className="cm-room-settings-row"
              onClick={() => setEditOpen(true)}
            >
              クラス情報を編集
            </button>
          ) : null}

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

      <ClassInfoEditSheet
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          onClose();
        }}
        classId={classId}
        deviceId={deviceId}
        initialTitle={loadedTitle ?? classTitle}
        initialSystemName={loadedSystemName ?? systemClassName}
        initialCoverPath={loadedCoverPath ?? coverPath}
        onSaved={(next) => {
          onClassPresentationSaved?.(next);
          setEditOpen(false);
          onClose();
        }}
      />
    </>
  );
}
