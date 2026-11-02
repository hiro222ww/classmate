"use client";

import { useEffect, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";
import {
  CLASS_DISPLAY_NAME_MAX_LEN,
  buildClassCoverPublicUrl,
  resolveClassManagementLabel,
} from "@/lib/classPresentation";

type Props = {
  open: boolean;
  onClose: () => void;
  classId: string;
  deviceId: string;
  initialTitle?: string | null;
  initialSystemName?: string | null;
  initialCoverPath?: string | null;
  onSaved?: (next: {
    title: string;
    displayName: string | null;
    coverPath: string | null;
  }) => void;
};

export function ClassInfoEditSheet({
  open,
  onClose,
  classId,
  deviceId,
  initialTitle = "",
  initialSystemName = "",
  initialCoverPath = null,
  onSaved,
}: Props) {
  const [title, setTitle] = useState(String(initialTitle ?? ""));
  const [coverPath, setCoverPath] = useState<string | null>(initialCoverPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(String(initialTitle ?? ""));
    setCoverPath(initialCoverPath);
    setError(null);
    setPreviewUrl(null);
  }, [open, initialTitle, initialCoverPath]);

  const coverSrc =
    previewUrl || buildClassCoverPublicUrl(coverPath) || null;
  const managementLabel = resolveClassManagementLabel({
    name: initialSystemName,
    classId,
  });

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await buildDeviceAuthHeaders(deviceId);
      const res = await fetch("/api/class/presentation", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          classId,
          deviceId,
          displayName: title,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(
          json?.error === "feature_not_migrated"
            ? "クラス編集機能の準備がまだ完了していません"
            : json?.error === "not_member"
              ? "このクラスのメンバーだけが編集できます"
              : "保存に失敗しました"
        );
        return;
      }
      onSaved?.({
        title: String(json.title ?? title),
        displayName: json.displayName ?? null,
        coverPath: coverPath,
      });
      onClose();
    } catch {
      setError("保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function onPickCover(file: File | null) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    try {
      const headers = await buildDeviceAuthHeaders(deviceId);
      const form = new FormData();
      form.set("deviceId", deviceId);
      form.set("classId", classId);
      form.set("file", file);
      const res = await fetch("/api/class/cover", {
        method: "POST",
        headers,
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setPreviewUrl(null);
        setError(
          json?.error === "feature_not_migrated"
            ? "クラス画像機能の準備がまだ完了していません"
            : json?.error === "unsupported_image_type"
              ? "JPG / PNG / WebP のみアップロードできます"
              : json?.error === "file_too_large"
                ? "画像サイズが大きすぎます"
                : "画像のアップロードに失敗しました"
        );
        return;
      }
      setCoverPath(String(json.coverPath ?? "").trim() || null);
    } catch {
      setPreviewUrl(null);
      setError("画像のアップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function clearCover() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await buildDeviceAuthHeaders(deviceId);
      const res = await fetch("/api/class/presentation", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          classId,
          deviceId,
          clearCover: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError("画像の削除に失敗しました");
        return;
      }
      setCoverPath(null);
      setPreviewUrl(null);
    } catch {
      setError("画像の削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="クラス情報を編集">
      <div className="cm-class-edit">
        <div className="cm-class-edit-cover-block">
          <div
            className="cm-class-edit-cover"
            style={
              coverSrc
                ? {
                    backgroundImage: `url(${coverSrc})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
            aria-hidden
          />
          <div className="cm-class-edit-cover-actions">
            <label className="cm-class-edit-file-btn">
              画像を変更
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onPickCover(file);
                }}
              />
            </label>
            {coverPath || previewUrl ? (
              <button
                type="button"
                className="cm-class-edit-text-btn"
                disabled={busy}
                onClick={() => {
                  void clearCover();
                }}
              >
                画像を削除
              </button>
            ) : null}
          </div>
        </div>

        <label className="cm-class-edit-field">
          <span>クラス名</span>
          <input
            type="text"
            value={title}
            maxLength={CLASS_DISPLAY_NAME_MAX_LEN}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：放課後の雑談部屋"
          />
        </label>

        <div className="cm-class-edit-meta">
          管理ID（変更不可）: {managementLabel}
        </div>

        {error ? <div className="cm-class-edit-error">{error}</div> : null}

        <div className="cm-class-edit-actions">
          <button
            type="button"
            className="cm-class-edit-cancel"
            disabled={busy}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="cm-cta-primary cm-class-edit-save"
            disabled={busy}
            onClick={() => {
              void save();
            }}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
