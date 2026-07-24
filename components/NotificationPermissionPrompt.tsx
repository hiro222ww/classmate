"use client";

import { useCallback, useEffect, useState } from "react";
import { detectLineInAppBrowser } from "@/lib/lineInAppBrowser";
import {
  canUseWebPushOnThisClient,
  getNotificationPermissionState,
  markNotificationPromptDeferred,
  readNotificationPromptState,
  shouldShowNotificationSoftAsk,
  writeNotificationPromptState,
} from "@/lib/notificationPrompt";
import { subscribeWebPush } from "@/lib/webPushClient";

type Props = {
  deviceId: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
};

function isNativeAppClient(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (
      window as Window & {
        Capacitor?: {
          isNativePlatform?: () => boolean;
          getPlatform?: () => string;
        };
      }
    ).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    const platform = cap?.getPlatform?.();
    return platform === "ios" || platform === "android";
  } catch {
    return false;
  }
}

export default function NotificationPermissionPrompt({
  deviceId,
  enabled,
  onEnabledChange,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!deviceId) return;

    const timer = window.setTimeout(() => {
      try {
        const isLine = detectLineInAppBrowser(
          typeof navigator !== "undefined" ? navigator.userAgent : ""
        ).isLine;
        const isNative = isNativeAppClient();
        const permission = getNotificationPermissionState();
        const stored = readNotificationPromptState();
        const show = shouldShowNotificationSoftAsk({
          isLineInAppBrowser: isLine,
          isNativeApp: isNative,
          permission,
          canUsePush: canUseWebPushOnThisClient(),
          deferredUntil: stored.deferredUntil ?? null,
        });
        setVisible(show);
      } catch (e) {
        console.warn("[NotificationPermissionPrompt] soft-ask check failed", e);
        setVisible(false);
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [deviceId]);

  const dismiss = useCallback(() => {
    try {
      markNotificationPromptDeferred();
    } catch {
      // ignore
    }
    setVisible(false);
  }, []);

  const enable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = getNotificationPermissionState();
      if (permission === "denied" || permission === "unsupported") {
        setVisible(false);
        return;
      }

      const result = await subscribeWebPush(deviceId);
      if (result.ok) {
        try {
          localStorage.setItem("notifications_enabled", "true");
        } catch {
          // ignore
        }
        onEnabledChange(true);
        writeNotificationPromptState({
          ...readNotificationPromptState(),
          lastShownAt: Date.now(),
        });
        setVisible(false);
        return;
      }

      if (result.error === "permission_denied") {
        setVisible(false);
        return;
      }

      markNotificationPromptDeferred();
      setVisible(false);
    } catch (e) {
      console.warn("[NotificationPermissionPrompt] enable failed", e);
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }, [busy, deviceId, onEnabledChange]);

  // Only repair Push subscription when the user already opted in (app flag ON).
  // Do NOT force-enable just because Notification.permission === "granted"
  // (browser permission can remain granted after the user turns Classmate Push OFF).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!deviceId) return;
    if (!enabled) return;

    try {
      if (
        detectLineInAppBrowser(
          typeof navigator !== "undefined" ? navigator.userAgent : ""
        ).isLine
      ) {
        return;
      }
      if (isNativeAppClient()) return;
      if (!canUseWebPushOnThisClient()) return;

      const permission = getNotificationPermissionState();
      if (permission !== "granted") return;

      let optedIn = false;
      try {
        optedIn = localStorage.getItem("notifications_enabled") === "true";
      } catch {
        optedIn = enabled;
      }
      if (!optedIn) return;

      void subscribeWebPush(deviceId).catch(() => null);
    } catch (e) {
      console.warn("[NotificationPermissionPrompt] resubscribe failed", e);
    }
  }, [deviceId, enabled]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-prompt-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(17, 24, 39, 0.45)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          display: "grid",
          gap: 14,
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
      >
        <div
          id="notification-prompt-title"
          style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.45 }}
        >
          クラスの開始や呼び出しを見逃さないため、通知をオンにしてください
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
          ブラウザの許可ダイアログが表示されたら「許可」を選んでください。
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void enable()}
            style={{
              flex: 1,
              minWidth: 140,
              border: "none",
              borderRadius: 12,
              padding: "12px 14px",
              background: "#22c55e",
              color: "#fff",
              fontWeight: 900,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "設定中…" : "通知をオンにする"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={dismiss}
            style={{
              flex: 1,
              minWidth: 100,
              border: "1px solid #d1d5db",
              borderRadius: 12,
              padding: "12px 14px",
              background: "#fff",
              color: "#374151",
              fontWeight: 800,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            あとで
          </button>
        </div>
      </div>
    </div>
  );
}
