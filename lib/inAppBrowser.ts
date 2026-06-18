export type InAppBrowserDetection = {
  detected: boolean;
  uaHint: string;
  platform: "ios" | "android" | "desktop";
  openHint: string;
};

function detectPlatform(ua: string): InAppBrowserDetection["platform"] {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Best-effort in-app / embedded browser detection from User-Agent. */
export function detectInAppBrowser(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""
): InAppBrowserDetection {
  const ua = String(userAgent ?? "");
  const platform = detectPlatform(ua);

  const rules: Array<{ pattern: RegExp; hint: string }> = [
    { pattern: /\bLine\//i, hint: "LINE" },
    { pattern: /\bInstagram\b/i, hint: "Instagram" },
    { pattern: /\bFBAN|FBAV|FB_IAB/i, hint: "Facebook" },
    { pattern: /\bMessenger\b/i, hint: "Messenger" },
    { pattern: /\bDiscord\b/i, hint: "Discord" },
    { pattern: /\bTikTok\b/i, hint: "TikTok" },
    { pattern: /\bTwitter\b/i, hint: "Twitter" },
    { pattern: /\bX-Twitter\b/i, hint: "X" },
    { pattern: /\bwv\b.*Android/i, hint: "Android-WebView" },
    { pattern: /\bGSA\//i, hint: "GoogleApp" },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(ua)) {
      return {
        detected: true,
        uaHint: rule.hint,
        platform,
        openHint:
          platform === "ios"
            ? "右上または下部のメニューから「Safariで開く」を選んでください。"
            : platform === "android"
              ? "メニューから「Chromeで開く」を選んでください。"
              : "SafariまたはChromeで開き直してください。",
      };
    }
  }

  return {
    detected: false,
    uaHint: "-",
    platform,
    openHint: "",
  };
}

export const IN_APP_BROWSER_NOTICE_SHORT =
  "アプリ内ブラウザでは通話がうまく動作しない場合があります。SafariまたはChromeで開くことをおすすめします。";
