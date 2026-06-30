import { sanitizeReturnTo } from "@/lib/authAccount";
import { getAppOrigin, resolveAppOrigin } from "@/lib/appOrigin";
import {
  isCapacitorNativeApp,
  NATIVE_AUTH_CALLBACK_BASE,
} from "@/lib/capacitorClient";

const OAUTH_RETURN_TO_KEY = "classmate_oauth_return_to";

/** Google OAuth 開始前に returnTo を保存（redirectTo には含めない） */
export function stashOAuthReturnTo(returnTo?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      OAUTH_RETURN_TO_KEY,
      sanitizeReturnTo(returnTo ?? "/home")
    );
  } catch {
    // ignore
  }
}

/** /auth/callback で returnTo クエリが無いときに使う */
export function consumeOAuthReturnTo(fallback = "/home"): string {
  if (typeof window === "undefined") return sanitizeReturnTo(fallback);
  try {
    const stored = window.sessionStorage.getItem(OAUTH_RETURN_TO_KEY);
    window.sessionStorage.removeItem(OAUTH_RETURN_TO_KEY);
    if (stored) return sanitizeReturnTo(stored);
  } catch {
    // ignore
  }
  return sanitizeReturnTo(fallback);
}

/**
 * Supabase signInWithOAuth / linkIdentity 用の redirectTo。
 * クエリを付けずパスのみにし、Supabase Redirect URLs との一致を安定させる。
 */
export function buildOAuthRedirectUrl(): string {
  if (typeof window !== "undefined" && isCapacitorNativeApp()) {
    return NATIVE_AUTH_CALLBACK_BASE;
  }

  const origin =
    typeof window !== "undefined"
      ? getAppOrigin()
      : resolveAppOrigin();

  return `${origin.replace(/\/+$/, "")}/auth/callback`;
}

/**
 * メールリンク等のコールバック URL（returnTo をクエリに含める）。
 * 通常 Web: https://.../auth/callback?returnTo=...
 */
export function buildAuthCallbackUrl(returnTo?: string): string {
  const returnPath = sanitizeReturnTo(returnTo ?? "/home");
  const callbackQuery = `returnTo=${encodeURIComponent(returnPath)}`;
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

/** Supabase authorize URL 内の redirect_to をログ用に抽出 */
export function readRedirectToFromOAuthAuthorizeUrl(
  authorizeUrl: string
): string | null {
  try {
    const url = new URL(authorizeUrl);
    return url.searchParams.get("redirect_to");
  } catch {
    return null;
  }
}
