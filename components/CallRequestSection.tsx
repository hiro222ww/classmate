"use client";

import { useMemo, useState } from "react";
import type { CallRequestPublic } from "@/lib/callRequest";

type Props = {
  classId: string;
  deviceId: string;
  request: CallRequestPublic | null;
  showCreateButton?: boolean;
  compact?: boolean;
  entering?: boolean;
  onUpdated?: (request: CallRequestPublic | null) => void;
  onEnter?: () => void;
};

async function readJsonSafe(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function CallRequestSection({
  classId,
  deviceId,
  request,
  showCreateButton = true,
  compact = false,
  entering = false,
  onUpdated,
  onEnter,
}: Props) {
  const safeClassId = String(classId ?? "").trim();
  const safeDeviceId = String(deviceId ?? "").trim();
  const safeRequest = request ?? null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRequest = useMemo(() => {
    if (!safeRequest?.is_active) return null;
    return safeRequest;
  }, [safeRequest]);

  async function createRequest() {
    if (!safeDeviceId || !safeClassId || activeRequest) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/class/call-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_id: safeDeviceId,
          class_id: safeClassId,
        }),
      });
      const json = await readJsonSafe(res);

      if (!res.ok || !json?.ok) {
        setError(String(json?.error ?? "送信に失敗しました"));
        return;
      }

      onUpdated?.((json.request as CallRequestPublic) ?? null);
    } catch {
      setError("送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    if (!safeDeviceId || !safeClassId || !activeRequest?.is_mine) return;
    if (!window.confirm("「今ひま？」の呼びかけをキャンセルしますか？")) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/class/call-request", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_id: safeDeviceId,
          class_id: safeClassId,
        }),
      });
      const json = await readJsonSafe(res);

      if (!res.ok || !json?.ok) {
        setError(String(json?.error ?? "キャンセルに失敗しました"));
        return;
      }

      onUpdated?.(null);
    } catch {
      setError("キャンセルに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (activeRequest) {
    return (
      <div
        style={{
          marginTop: compact ? 0 : 10,
          padding: compact ? "10px 12px" : "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(5, 150, 105, 0.28)",
          background: "linear-gradient(180deg, #f8fffb 0%, #ecfdf5 100%)",
          boxShadow: "0 1px 4px rgba(5, 150, 105, 0.08)",
        }}
      >
        <div
          style={{
            fontSize: compact ? 12 : 13,
            fontWeight: 900,
            color: "#065f46",
            lineHeight: 1.45,
          }}
        >
            {String(activeRequest.display_label ?? "今話せる人を探しています")}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 8,
            alignItems: "center",
          }}
        >
          {activeRequest.is_mine ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void cancelRequest()}
              style={secondaryButtonStyle(busy)}
            >
              {busy ? "処理中…" : "キャンセル"}
            </button>
          ) : onEnter ? (
            <button
              type="button"
              disabled={busy || entering}
              onClick={onEnter}
              style={enterButtonStyle(busy || entering)}
            >
              {entering ? "入っています…" : "入る"}
            </button>
          ) : null}
        </div>

        {error ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "#dc2626",
              fontWeight: 800,
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  if (!showCreateButton || !safeDeviceId) {
    return null;
  }

  return (
    <div style={{ marginTop: compact ? 0 : 10 }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void createRequest()}
        style={createButtonStyle(busy)}
      >
        {busy ? "送信中…" : "今ひま？"}
      </button>

      {error ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "#dc2626",
            fontWeight: 800,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function createButtonStyle(disabled: boolean) {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 900,
    fontSize: 13,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
  } as const;
}

function enterButtonStyle(disabled: boolean) {
  return {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #059669",
    background: "#059669",
    color: "#fff",
    fontWeight: 900,
    fontSize: 12,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  } as const;
}

function secondaryButtonStyle(disabled: boolean) {
  return {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#374151",
    fontWeight: 900,
    fontSize: 12,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  } as const;
}
