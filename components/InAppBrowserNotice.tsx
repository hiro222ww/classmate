"use client";

import { useEffect, useState } from "react";
import {
  detectInAppBrowser,
  IN_APP_BROWSER_NOTICE_SHORT,
  type InAppBrowserDetection,
} from "@/lib/inAppBrowser";
import { HelpTip } from "@/components/HelpTip";

type InAppBrowserNoticeProps = {
  compact?: boolean;
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

export function InAppBrowserNotice({ compact = false }: InAppBrowserNoticeProps) {
  const [detection, setDetection] = useState<InAppBrowserDetection | null>(null);

  useEffect(() => {
    try {
      if (isNativeAppClient()) {
        setDetection(null);
        return;
      }
      const next = detectInAppBrowser(
        typeof navigator !== "undefined" ? navigator.userAgent : ""
      );
      if (!next.detected || next.platform === "desktop" || next.uaHint === "LINE") {
        setDetection(null);
        return;
      }
      setDetection(next);
    } catch {
      setDetection(null);
    }
  }, []);

  if (!detection) return null;

  const detail = `${IN_APP_BROWSER_NOTICE_SHORT} ${detection.openHint}`;

  if (compact) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid #fde68a",
          background: "#fffbeb",
          fontSize: 12,
          color: "#92400e",
          lineHeight: 1.6,
        }}
      >
        <HelpTip label="アプリ内ブラウザについて" content={detail}>
          <span style={{ fontWeight: 800 }}>アプリ内ブラウザのご注意</span>
        </HelpTip>
      </div>
    );
  }

  return (
    <div
      role="note"
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid #fde68a",
        background: "#fffbeb",
        fontSize: 13,
        color: "#92400e",
        lineHeight: 1.65,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 4 }}>アプリ内ブラウザのご注意</div>
      <div>{IN_APP_BROWSER_NOTICE_SHORT}</div>
      <div style={{ marginTop: 6 }}>{detection.openHint}</div>
    </div>
  );
}
