"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { isCapacitorNativeApp } from "@/lib/capacitorClient";
import {
  buildAndroidChromeIntentUrl,
  detectLineInAppBrowser,
} from "@/lib/lineInAppBrowser";

type Props = {
  children: React.ReactNode;
};

const EMPTY_SUBSCRIBE = () => () => {};

function getLineSnapshot() {
  if (isCapacitorNativeApp()) {
    return {
      isLine: false,
      platform: "unknown" as const,
      href: "",
    };
  }
  const detection = detectLineInAppBrowser();
  return {
    isLine: detection.isLine,
    platform: detection.platform,
    href: typeof window !== "undefined" ? window.location.href : "",
  };
}

function getServerSnapshot() {
  return {
    isLine: false,
    platform: "unknown" as const,
    href: "",
  };
}

export default function LineInAppBrowserGate({ children }: Props) {
  const detection = useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    getLineSnapshot,
    getServerSnapshot
  );
  const [copied, setCopied] = useState(false);

  const androidIntentUrl = useMemo(() => {
    if (detection.platform !== "android" || !detection.href) return null;
    return buildAndroidChromeIntentUrl(detection.href);
  }, [detection.href, detection.platform]);

  const copyUrl = useCallback(async () => {
    const url =
      detection.href ||
      (typeof window !== "undefined" ? window.location.href : "");
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("このURLをコピーしてください", url);
    }
  }, [detection.href]);

  if (!detection.isLine) return <>{children}</>;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "linear-gradient(160deg, #ecfdf5 0%, #ffffff 45%, #f0fdf4 100%)",
        color: "#111827",
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          display: "grid",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em" }}>
          classmate
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, lineHeight: 1.4 }}>
          LINE内のブラウザでは通話機能を利用できません
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "#374151" }}>
          SafariまたはChromeで開いてください。招待リンクの内容はそのまま維持されます。
        </p>

        <div
          style={{
            padding: 14,
            borderRadius: 14,
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            fontSize: 13,
            lineHeight: 1.7,
            color: "#166534",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>開き方</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li>画面右上の「…」メニューを開く</li>
            <li>「デフォルトのブラウザで開く」を選ぶ</li>
            <li>Safari または Chrome で招待URLを開く</li>
          </ol>
        </div>

        <button
          type="button"
          onClick={() => void copyUrl()}
          style={{
            border: "none",
            borderRadius: 12,
            padding: "14px 16px",
            background: "#111827",
            color: "#fff",
            fontWeight: 900,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          {copied ? "コピーしました" : "招待URLをコピー"}
        </button>

        {androidIntentUrl ? (
          <a
            href={androidIntentUrl}
            style={{
              display: "block",
              textAlign: "center",
              borderRadius: 12,
              padding: "14px 16px",
              background: "#22c55e",
              color: "#fff",
              fontWeight: 900,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            Chromeで開く（Android）
          </a>
        ) : (
          <div
            style={{
              fontSize: 13,
              color: "#6b7280",
              lineHeight: 1.6,
            }}
          >
            URLをコピーしたあと、Safari または Chrome
            のアドレス欄に貼り付けて開いてください。
          </div>
        )}

        <div
          style={{
            fontSize: 12,
            color: "#9ca3af",
            lineHeight: 1.6,
            wordBreak: "break-all",
          }}
        >
          {detection.href}
        </div>
      </div>
    </div>
  );
}
