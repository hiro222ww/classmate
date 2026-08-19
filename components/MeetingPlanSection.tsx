"use client";

import { useEffect, useMemo, useState } from "react";
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

  // Keep initial localValue empty so SSR/client first paint never diverge via Date.now().
  // Value is filled only when the editor opens (client interaction).
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // deviceId is often "" on SSR (no window/localStorage) and a real id on the
  // client first paint. Gate action enablement until after mount so the first
  // client render matches the server HTML.
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setClientReady(true);
  }, []);

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
  // Until clientReady, treat actions as unavailable so SSR HTML matches the
  // first client render even when parent passes a browser-only deviceId.
  const canAct = clientReady && Boolean(safeDeviceId);
  const summaryClassName = [
    "meeting-plan-summary",
    safePlan?.is_past ? "is-past" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={[
        "meeting-plan-section",
        compact ? "is-compact" : "",
        editing ? "is-editing" : "",
        hasFuturePlan ? "has-future-plan" : "",
        error ? "has-error" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        marginTop: compact ? 0 : 10,
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: compact ? "#fafafa" : "#f9fafb",
      }}
    >
      <div
        className={summaryClassName}
        style={{
          fontSize,
          fontWeight: 900,
          color: safePlan?.is_past ? "#6b7280" : "#111827",
        }}
      >
        {summaryText}
      </div>

      {/*
        Always keep the same action-row DOM when showActions is on.
        deviceId readiness and hasFuturePlan only toggle className / disabled /
        visibility — never add/remove tags between SSR and first client paint.
      */}
      {showActions ? (
        <div
          className="meeting-plan-actions"
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 8,
            alignItems: "center",
          }}
        >
          <div
            className="meeting-plan-view-controls"
            style={{
              display: editing ? "none" : "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              disabled={busy || !canAct}
              onClick={openEditor}
              style={actionButtonStyle(busy || !canAct)}
            >
              {hasFuturePlan ? "変更" : "集合時間を設定"}
            </button>

            <button
              type="button"
              disabled={busy || !canAct || !hasFuturePlan}
              onClick={() => void cancelPlan()}
              className={
                hasFuturePlan
                  ? "meeting-plan-cancel-btn"
                  : "meeting-plan-cancel-btn is-hidden"
              }
              style={{
                ...secondaryButtonStyle(busy || !canAct || !hasFuturePlan),
                display: hasFuturePlan ? undefined : "none",
              }}
            >
              キャンセル
            </button>
          </div>

          <div
            className="meeting-plan-edit-controls"
            style={{
              display: editing ? "flex" : "none",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="datetime-local"
              value={localValue}
              disabled={busy || !canAct}
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
              disabled={busy || !canAct}
              onClick={() => void savePlan()}
              style={actionButtonStyle(busy || !canAct)}
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
          </div>
        </div>
      ) : null}

      <div
        className={error ? "meeting-plan-error" : "meeting-plan-error is-empty"}
        style={{
          marginTop: 6,
          fontSize: 11,
          color: "#dc2626",
          fontWeight: 800,
          display: error ? undefined : "none",
        }}
      >
        {error ?? ""}
      </div>
    </div>
  );
}

function actionButtonStyle(disabled: boolean) {
  return {
    padding: "8px 10px",
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
