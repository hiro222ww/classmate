"use client";

import { useMemo, useState } from "react";
import {
  isoToJstDatetimeLocalInput,
  type MeetingPlanPublic,
} from "@/lib/meetingPlanClient";

type Props = {
  classId: string;
  deviceId: string;
  plan: MeetingPlanPublic | null;
  compact?: boolean;
  showActions?: boolean;
  onUpdated?: (plan: MeetingPlanPublic | null) => void;
};

async function readJsonSafe(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function defaultLocalValue(plan: MeetingPlanPublic | null) {
  if (plan?.scheduled_at && !plan.is_past) {
    return isoToJstDatetimeLocalInput(plan.scheduled_at);
  }

  const now = new Date();
  now.setTime(now.getTime() + 60 * 60 * 1000);
  const minutes = now.getMinutes();
  now.setMinutes(minutes + ((15 - (minutes % 15)) % 15 || 15), 0, 0);
  return isoToJstDatetimeLocalInput(now.toISOString());
}

export default function MeetingPlanSection({
  classId,
  deviceId,
  plan,
  compact = false,
  showActions = true,
  onUpdated,
}: Props) {
  const safeClassId = String(classId ?? "").trim();
  const safeDeviceId = String(deviceId ?? "").trim();
  const safePlan = plan ?? null;

  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(() => defaultLocalValue(safePlan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summaryText = useMemo(() => {
    if (!safePlan) return "次の集合は未定";
    if (safePlan.is_past) return "次の集合：終了済み";
    return `次の集合：${safePlan.display_label || "未定"}`;
  }, [safePlan]);

  async function savePlan() {
    if (!safeDeviceId || !safeClassId || !localValue.trim()) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/class/meeting-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_id: safeDeviceId,
          class_id: safeClassId,
          scheduled_at: localValue,
        }),
      });
      const json = await readJsonSafe(res);

      if (!res.ok || !json?.ok) {
        setError(String(json?.error ?? "保存に失敗しました"));
        return;
      }

      setEditing(false);
      onUpdated?.((json.plan as MeetingPlanPublic) ?? null);
    } catch {
      setError("保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPlan() {
    if (!safeDeviceId || !safeClassId || !safePlan) return;
    if (!window.confirm("次の集合時間をキャンセルしますか？")) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/class/meeting-plan", {
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

      setEditing(false);
      onUpdated?.(null);
    } catch {
      setError("キャンセルに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  function openEditor() {
    setLocalValue(defaultLocalValue(safePlan));
    setEditing(true);
    setError(null);
  }

  const hasFuturePlan = Boolean(safePlan && !safePlan.is_past);
  const fontSize = compact ? 12 : 13;

  return (
    <div
      style={{
        marginTop: compact ? 0 : 10,
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: compact ? "#fafafa" : "#f9fafb",
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight: 900,
          color: plan?.is_past ? "#6b7280" : "#111827",
        }}
      >
        {summaryText}
      </div>

      {showActions && safeDeviceId ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 8,
            alignItems: "center",
          }}
        >
          {!editing ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={openEditor}
                style={actionButtonStyle(busy)}
              >
                {hasFuturePlan ? "変更" : "集合時間を設定"}
              </button>

              {hasFuturePlan ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancelPlan()}
                  style={secondaryButtonStyle(busy)}
                >
                  キャンセル
                </button>
              ) : null}
            </>
          ) : (
            <>
              <input
                type="datetime-local"
                value={localValue}
                disabled={busy}
                onChange={(e) => setLocalValue(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePlan()}
                style={actionButtonStyle(busy)}
              >
                {busy ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                style={secondaryButtonStyle(busy)}
              >
                閉じる
              </button>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 6, fontSize: 11, color: "#dc2626", fontWeight: 800 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

function actionButtonStyle(disabled: boolean) {
  return {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #111827",
    background: "#111827",
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
