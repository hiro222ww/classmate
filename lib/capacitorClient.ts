"use client";

import { Capacitor } from "@capacitor/core";
import { getAppOrigin } from "@/lib/appOrigin";
import {
  clearHandledNativeAuthReturnUrl,
  clearPendingNativeOAuthUrl,
  isOAuthCodeConsumed,
  isSameAuthCallbackHref,
  readOAuthCodeFromLocation,
  readPendingNativeOAuthUrl,
  shouldHandleNativeAuthReturnUrl,
  stashPendingNativeOAuthUrl,
} from "@/lib/oauthCallbackDedupe";
import { consumeOAuthReturnTo } from "@/lib/authCallbackUrl";
import {
  defaultAuthCallbackReturnTo,
  resolveAppShellReturnTo,
} from "@/lib/appShellContext";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";

export const NATIVE_AUTH_CALLBACK_SCHEME = "classmate";
export const NATIVE_AUTH_CALLBACK_BASE = `${NATIVE_AUTH_CALLBACK_SCHEME}://auth/callback`;

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

/** Capacitor ネイティブ殻（iOS/Android）で動作中か。通常 Web ブラウザでは false。 */
export function isCapacitorNativeApp(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // @capacitor/core unavailable
  }

  const cap = (window as CapacitorWindow).Capacitor;
  if (cap?.isNativePlatform?.()) return true;

  const platform = cap?.getPlatform?.();
  if (platform === "ios" || platform === "android") return true;

  return false;
}

/** `classmate://auth/callback?...` かどうか */
export function isNativeAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${NATIVE_AUTH_CALLBACK_SCHEME}:`) return false;
    return (
      (parsed.hostname === "auth" && parsed.pathname === "/callback") ||
      parsed.pathname === "/auth/callback"
    );
  } catch {
    return false;
  }
}

/**
 * ネイティブ scheme の OAuth 戻り URL を本番 Web の /auth/callback URL に変換する。
 * query / hash（code, error 等）はそのまま引き継ぐ。
 */
export function nativeAuthCallbackToWebUrl(
  nativeUrl: string,
  webOrigin?: string
): string | null {
  if (!isNativeAuthCallbackUrl(nativeUrl)) return null;

  let parsed: URL;
  try {
    parsed = new URL(nativeUrl);
  } catch {
    return null;
  }

  const origin = (webOrigin ?? getAppOrigin()).replace(/\/+$/, "");
  return `${origin}/auth/callback${parsed.search}${parsed.hash}`;
}

let nativeOAuthCompleteInflight: Promise<boolean> | null = null;
let nativeOAuthCompleteInflightUrl: string | null = null;

/**
 * classmate://auth/callback?code=... を受け取り、WebView 遷移なしで
 * exchangeCodeForSession → postAuthSession まで完了する。
 */
export async function completeNativeOAuthReturn(
  nativeUrl: string
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isNativeAuthCallbackUrl(nativeUrl)) return false;

  if (
    nativeOAuthCompleteInflight &&
    nativeOAuthCompleteInflightUrl === nativeUrl
  ) {
    return nativeOAuthCompleteInflight;
  }

  const run = async (): Promise<boolean> => {
    stashPendingNativeOAuthUrl(nativeUrl);

    if (!shouldHandleNativeAuthReturnUrl(nativeUrl)) {
      console.info("[oauth-return] skip duplicate native url", nativeUrl);
      return false;
    }

    let parsed: URL;
    try {
      parsed = new URL(nativeUrl);
    } catch {
      return false;
    }

    const code = readOAuthCodeFromLocation(parsed.search, parsed.hash);
    if (!code) {
      console.warn("[oauth-return] native callback missing code", nativeUrl);
      return false;
    }

    if (isOAuthCodeConsumed(code)) {
      console.info("[oauth-return] skip consumed code");
      return false;
    }

    const deviceId = getDeviceId();
    if (!deviceId) {
      console.warn("[oauth-return] missing deviceId");
      return false;
    }

    const returnTo = resolveAppShellReturnTo(
      consumeOAuthReturnTo(defaultAuthCallbackReturnTo())
    );

    console.info("[oauth-return] complete inline", { code: code.slice(0, 8) });

    const { completeAuthCallback } = await import("@/lib/authClient");
    const result = await completeAuthCallback(deviceId, withDev(returnTo), {
      oauthCode: code,
    });

    clearPendingNativeOAuthUrl();
    clearHandledNativeAuthReturnUrl();

    if (!result.ok) {
      console.error("[oauth-return] complete failed", result.error, result.message);
      return false;
    }

    return true;
  };

  nativeOAuthCompleteInflight = run();
  nativeOAuthCompleteInflightUrl = nativeUrl;

  try {
    return await nativeOAuthCompleteInflight;
  } finally {
    nativeOAuthCompleteInflight = null;
    nativeOAuthCompleteInflightUrl = null;
  }
}

/** appUrlOpen / getLaunchUrl から受け取った URL で OAuth を完了 */
export function navigateToWebAuthCallback(nativeUrl: string): boolean {
  if (typeof window === "undefined") return false;
  if (!isNativeAuthCallbackUrl(nativeUrl)) return false;

  const webUrl = nativeAuthCallbackToWebUrl(nativeUrl);
  if (!webUrl) return false;

  if (isSameAuthCallbackHref(window.location.href, webUrl)) {
    console.info("[oauth-return] already on callback url");
    return false;
  }

  void completeNativeOAuthReturn(nativeUrl).then((ok) => {
    if (!ok) {
      console.info("[oauth-return] fallback navigate", webUrl);
      window.location.replace(webUrl);
    }
  });

  return true;
}

/** アプリ復帰時に OAuth 戻り URL の橋渡しを再試行 */
export function retryPendingNativeAuthReturn(): boolean {
  const pending = readPendingNativeOAuthUrl();
  if (!pending || !isNativeAuthCallbackUrl(pending)) return false;

  const path = window.location.pathname;
  if (path === "/auth/callback" || path.startsWith("/auth/callback")) {
    return false;
  }

  void completeNativeOAuthReturn(pending);
  return true;
}
