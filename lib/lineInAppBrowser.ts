export type LineInAppBrowserDetection = {
  isLine: boolean;
  platform: "ios" | "android" | "desktop" | "unknown";
  userAgent: string;
};

function detectPlatform(ua: string): LineInAppBrowserDetection["platform"] {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (!ua) return "unknown";
  return "desktop";
}

/**
 * Detect LINE in-app browser from User-Agent.
 * SSR-safe: never throws; returns isLine=false when navigator is unavailable.
 */
export function detectLineInAppBrowser(
  userAgent?: string | null
): LineInAppBrowserDetection {
  try {
    let ua = "";
    if (userAgent != null) {
      ua = String(userAgent);
    } else if (typeof navigator !== "undefined") {
      ua = String(navigator.userAgent ?? "");
    }

    return {
      isLine: /\bLine\//i.test(ua),
      platform: detectPlatform(ua),
      userAgent: ua,
    };
  } catch {
    return {
      isLine: false,
      platform: "unknown",
      userAgent: "",
    };
  }
}

export function buildAndroidChromeIntentUrl(href: string): string | null {
  try {
    if (!href || typeof href !== "string") return null;
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostAndPath = `${url.host}${url.pathname}${url.search}${url.hash}`;
    return `intent://${hostAndPath}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  } catch {
    return null;
  }
}
