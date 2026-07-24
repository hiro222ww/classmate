"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildAndroidChromeIntentUrl,
  detectLineInAppBrowser,
} from "@/lib/lineInAppBrowser";

type Props = {
  children: React.ReactNode;
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

/**
 * LINE in-app browser hard gate.
 * Detection runs only after mount (useEffect) to avoid SSR / hydration crashes.
 * Does not import Capacitor core (keeps root layout light and safe).
 */
export default function LineInAppBrowserGate({ children }: Props) {
  const [checked, setChecked] = useState(false);
  const [isLine, setIsLine] = useState(false);
  const [platform, setPlatform] = useState<
    "ios" | "android" | "desktop" | "unknown"
  >("unknown");
  const [currentUrl, setCurrentUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (isNativeAppClient()) {
        setIsLine(false);
        setChecked(true);
        return;
      }
      const detection = detectLineInAppBrowser(
        typeof navigator !== "undefined" ? navigator.userAgent : ""
      );
      setIsLine(detection.isLine);
      setPlatform(detection.platform);
      setCurrentUrl(
        typeof window !== "undefined" ? window.location.href : ""
      );
    } catch (e) {
      console.warn("[LineInAppBrowserGate] detection failed", e);
      setIsLine(false);
    } finally {
      setChecked(true);
    }
  }, []);

  const androidIntentUrl = useMemo(() => {
    if (platform !== "android" || !currentUrl) return null;
    return buildAndroidChromeIntentUrl(currentUrl);
  }, [currentUrl, platform]);

  const copyUrl = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = currentUrl || window.location.href;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {
      // fall through
    }
    window.prompt("このURLをコピーしてください", url);
  }, [currentUrl]);

  // Until client check finishes, always render children (no flash block for normal browsers).
  if (!checked || !isLine) {
    return <>{children}</>;
  }

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
          {currentUrl}
        </div>
      </div>
    </div>
  );
}
