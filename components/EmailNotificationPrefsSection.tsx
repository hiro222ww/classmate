"use client";

import { useCallback, useEffect, useState } from "react";
import { getDeviceId } from "@/lib/device";
import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";

type Prefs = {
  emailEnabled: boolean;
  emailCallRequest: boolean;
  emailMeetingPlan: boolean;
};

type Props = {
  /** When false, show login CTA instead of toggles. */
  canConfigure: boolean;
  email?: string | null;
  compact?: boolean;
};

const DEFAULT_PREFS: Prefs = {
  emailEnabled: false,
  emailCallRequest: true,
  emailMeetingPlan: true,
};

export default function EmailNotificationPrefsSection({
  canConfigure,
  email,
  compact = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const deviceId = getDeviceId();
      if (!deviceId) {
        setError("端末情報を取得できませんでした。");
        return;
      }
      const headers = await buildDeviceAuthHeaders(deviceId);
      const res = await fetch(
        `/api/user/notification-prefs?deviceId=${encodeURIComponent(deviceId)}`,
        { headers, cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError("通知設定の取得に失敗しました。");
        return;
      }
      setConfigured(json.configured !== false);
      setPrefs({
        emailEnabled: Boolean(json.prefs?.emailEnabled),
        emailCallRequest: json.prefs?.emailCallRequest !== false,
        emailMeetingPlan: json.prefs?.emailMeetingPlan !== false,
      });
    } catch {
      setError("通知設定の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canConfigure) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [canConfigure, refresh]);

  async function save(next: Partial<Prefs>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const deviceId = getDeviceId();
      if (!deviceId) {
        setError("端末情報を取得できませんでした。");
        return;
      }
      const headers = {
        ...(await buildDeviceAuthHeaders(deviceId)),
        "content-type": "application/json",
      };
      const res = await fetch("/api/user/notification-prefs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          deviceId,
          emailEnabled: next.emailEnabled ?? prefs.emailEnabled,
          emailCallRequest: next.emailCallRequest ?? prefs.emailCallRequest,
          emailMeetingPlan: next.emailMeetingPlan ?? prefs.emailMeetingPlan,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(
          String(json?.message ?? json?.error ?? "保存に失敗しました。")
        );
        return;
      }
      setConfigured(json.configured !== false);
      setPrefs({
        emailEnabled: Boolean(json.prefs?.emailEnabled),
        emailCallRequest: json.prefs?.emailCallRequest !== false,
        emailMeetingPlan: json.prefs?.emailMeetingPlan !== false,
      });
      setMessage("通知設定を保存しました。");
    } catch {
      setError("保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: compact ? 10 : 12 }}>
      <div>
        <div style={{ fontWeight: 900, fontSize: compact ? 14 : 16 }}>
          メール通知
        </div>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          ブラウザを閉じていても、「今ひま？」呼び出しと集合プランをお知らせします。
          初期状態はオフです。クラスメッセージには送りません。
        </p>
      </div>

      {!canConfigure ? (
        <p style={{ margin: 0, fontSize: 13, color: "#92400e", fontWeight: 700 }}>
          Google ログイン後に設定できます。
        </p>
      ) : loading ? (
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>読み込み中…</p>
      ) : (
        <>
          {email ? (
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              送信先: {email}
            </p>
          ) : null}

          {!configured ? (
            <p style={{ margin: 0, fontSize: 12, color: "#b45309" }}>
              メール送信のサーバー設定が未完了です。設定は保存できますが、送信開始は準備後になります。
            </p>
          ) : null}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontWeight: 800,
              fontSize: 14,
              cursor: busy ? "default" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.emailEnabled}
              disabled={busy}
              onChange={(e) => void save({ emailEnabled: e.target.checked })}
            />
            メール通知をオンにする
          </label>

          {prefs.emailEnabled ? (
            <div style={{ display: "grid", gap: 8, paddingLeft: 4 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#374151",
                }}
              >
                <input
                  type="checkbox"
                  checked={prefs.emailCallRequest}
                  disabled={busy}
                  onChange={(e) =>
                    void save({ emailCallRequest: e.target.checked })
                  }
                />
                「今ひま？」呼び出し
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#374151",
                }}
              >
                <input
                  type="checkbox"
                  checked={prefs.emailMeetingPlan}
                  disabled={busy}
                  onChange={(e) =>
                    void save({ emailMeetingPlan: e.target.checked })
                  }
                />
                集合プランの作成・更新
              </label>
            </div>
          ) : null}
        </>
      )}

      {message ? (
        <p style={{ margin: 0, color: "#166534", fontSize: 13, fontWeight: 700 }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p style={{ margin: 0, color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
