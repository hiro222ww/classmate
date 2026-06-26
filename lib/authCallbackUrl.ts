import { sanitizeReturnTo } from "@/lib/authAccount";
import { getAppOrigin, resolveAppOrigin } from "@/lib/appOrigin";

/**
 * メール内リンク用のコールバック URL。
 * スマホのメールアプリから開けるよう、NEXT_PUBLIC_APP_ORIGIN を優先する。
 */
export function buildAuthCallbackUrl(returnTo?: string): string {
  const returnPath = sanitizeReturnTo(returnTo ?? "/home");
  const callbackPath = `/auth/callback?returnTo=${encodeURIComponent(returnPath)}`;

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
