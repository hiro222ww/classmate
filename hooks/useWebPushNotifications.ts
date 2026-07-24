"use client";

import { useCallback, useEffect, useState } from "react";
import { getDeviceId } from "@/lib/device";
import {
  isWebPushSupported,
  subscribeWebPush,
  unsubscribeWebPush,
} from "@/lib/webPushClient";

export function useWebPushNotifications(
  deviceId: string,
  logContext = "app"
) {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    setEnabled(localStorage.getItem("notifications_enabled") === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!deviceId || !enabled || !mounted) return;

    void subscribeWebPush(deviceId)
      .then((result) => {
        if (!result.ok && result.error !== "permission_denied") {
          console.warn(`[${logContext}] web push resubscribe failed`, result.error);
        }
      })
      .catch((e) => {
        console.warn(`[${logContext}] web push resubscribe error`, e);
      });
  }, [deviceId, enabled, logContext, mounted]);

  const toggle = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (busy) return;

    setBusy(true);
    setFeedback(null);

    try {
      if (!isWebPushSupported()) {
        alert(
          "このブラウザは Web Push に対応していません。Chrome / Edge / Firefox、または iOS 16.4+ でホーム画面に追加した Safari をお試しください。"
        );
        return;
      }

      const id = String(getDeviceId() ?? deviceId ?? "").trim();

      if (enabled) {
        if (id) {
          await unsubscribeWebPush(id);
        }
        localStorage.setItem("notifications_enabled", "false");
        setEnabled(false);
        setFeedback("プッシュ通知をオフにしました");
        return;
      }

      if (!id) {
        alert("device_id_missing");
        return;
      }

      setFeedback("通知を設定しています…");

      const result = await subscribeWebPush(id);
      if (!result.ok) {
        setFeedback(null);
        if (result.error === "permission_denied") {
          alert("通知が許可されていません。ブラウザ設定を確認してください。");
        } else if (result.error === "vapid_not_configured") {
          alert(
            "Push通知は現在サーバー設定中です。しばらくしてからお試しください。"
          );
        } else {
          alert("Push通知の有効化に失敗しました。");
        }
        return;
      }

      localStorage.setItem("notifications_enabled", "true");
      setEnabled(true);
      setFeedback("プッシュ通知 ON！ 今ひま？・メッセージなどが届きます");
    } finally {
      setBusy(false);
    }
  }, [busy, deviceId, enabled]);

  const markEnabled = useCallback((next: boolean) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("notifications_enabled", next ? "true" : "false");
    setEnabled(next);
  }, []);

  return { enabled, toggle, busy, feedback, mounted, markEnabled };
}
