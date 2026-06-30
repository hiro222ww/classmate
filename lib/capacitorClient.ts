"use client";

import { getAppOrigin } from "@/lib/appOrigin";

export const NATIVE_AUTH_CALLBACK_SCHEME = "classmate";
export const NATIVE_AUTH_CALLBACK_BASE = `${NATIVE_AUTH_CALLBACK_SCHEME}://auth/callback`;

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

/** Capacitor ネイティブ殻（iOS/Android）で動作中か。通常 Web ブラウザでは false。 */
export function isCapacitorNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as CapacitorWindow).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
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

/** appUrlOpen / getLaunchUrl から受け取った URL で WebView を本番 callback へ遷移 */
export function navigateToWebAuthCallback(nativeUrl: string): boolean {
  if (typeof window === "undefined") return false;
  const webUrl = nativeAuthCallbackToWebUrl(nativeUrl);
  if (!webUrl) return false;
  window.location.replace(webUrl);
  return true;
}
