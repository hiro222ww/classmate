import { sanitizeReturnTo } from "@/lib/authAccount";
import { getAppOrigin, resolveAppOrigin } from "@/lib/appOrigin";
import {
  isCapacitorNativeApp,
  NATIVE_AUTH_CALLBACK_BASE,
} from "@/lib/capacitorClient";

/**
 * OAuth / メールリンクのコールバック URL。
 * 通常 Web: https://.../auth/callback
 * Capacitor iOS アプリ: classmate://auth/callback（Custom URL Scheme）
 */
export function buildAuthCallbackUrl(returnTo?: string): string {
  const returnPath = sanitizeReturnTo(returnTo ?? "/home");
  const callbackQuery = `returnTo=${encodeURIComponent(returnPath)}`;

  if (typeof window !== "undefined" && isCapacitorNativeApp()) {
    return `${NATIVE_AUTH_CALLBACK_BASE}?${callbackQuery}`;
  }

  const callbackPath = `/auth/callback?${callbackQuery}`;

  if (typeof window !== "undefined") {
    const envOrigin = String(
      process.env.NEXT_PUBLIC_APP_ORIGIN ??
        process.env.NEXT_PUBLIC_APP_URL ??
        ""
    )
      .trim()
      .replace(/\/+$/, "");

    if (envOrigin) {
      return `${envOrigin}${callbackPath}`;
    }

    const liveOrigin = window.location.origin.replace(/\/+$/, "");
    return `${liveOrigin}${callbackPath}`;
  }

  return `${resolveAppOrigin()}${callbackPath}`;
}

/** @deprecated use buildAuthCallbackUrl */
export function buildAuthCallbackUrlFromOrigin(returnTo?: string) {
  return buildAuthCallbackUrl(returnTo);
}

export function isLocalAuthOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function authCallbackOriginForDisplay(): string {
  return getAppOrigin();
}
