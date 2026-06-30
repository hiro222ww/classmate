"use client";

import { Capacitor } from "@capacitor/core";
import { getAppOrigin } from "@/lib/appOrigin";
import {
  isOAuthCodeConsumed,
  isSameAuthCallbackHref,
  readOAuthCodeFromLocation,
  shouldHandleNativeAuthReturnUrl,
} from "@/lib/oauthCallbackDedupe";

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

/** appUrlOpen / getLaunchUrl から受け取った URL で WebView を本番 callback へ遷移（1回のみ） */
export function navigateToWebAuthCallback(nativeUrl: string): boolean {
  if (typeof window === "undefined") return false;
  if (!isNativeAuthCallbackUrl(nativeUrl)) return false;
  if (!shouldHandleNativeAuthReturnUrl(nativeUrl)) {
    console.info("[oauth-return] skip duplicate native url", nativeUrl);
    return false;
  }

  const webUrl = nativeAuthCallbackToWebUrl(nativeUrl);
  if (!webUrl) return false;

  if (isSameAuthCallbackHref(window.location.href, webUrl)) {
    console.info("[oauth-return] already on callback url");
    return false;
  }

  const code = readOAuthCodeFromLocation(
    new URL(webUrl).search,
    new URL(webUrl).hash
  );
  if (code && isOAuthCodeConsumed(code)) {
    console.info("[oauth-return] skip consumed code");
    return false;
  }

  console.info("[oauth-return] navigate", webUrl);
  window.location.replace(webUrl);
  return true;
}
