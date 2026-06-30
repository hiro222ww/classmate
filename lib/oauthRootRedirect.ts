"use client";

import { sanitizeReturnTo } from "@/lib/authAccount";

function hasOAuthCallbackParams(search: string, hash: string): boolean {
  if (hash.includes("access_token=") || hash.includes("refresh_token=")) {
    return true;
  }
  try {
    const params = new URLSearchParams(search);
    if (params.has("code") || params.has("token_hash")) return true;
    if (params.has("error") && params.get("error") !== "access_denied") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Supabase が Site URL (/) に code を付けて戻した場合の保険。
 * /auth/callback へクエリ・ハッシュごと転送する。
 */
export function redirectOAuthCodeFromRootIfNeeded(): boolean {
  if (typeof window === "undefined") return false;

  const { pathname, search, hash } = window.location;
  if (pathname !== "/") return false;
  if (!hasOAuthCallbackParams(search, hash)) return false;

  const target = `/auth/callback${search}${hash}`;
  window.location.replace(target);
  return true;
}

export function resolveAuthCallbackReturnTo(
  searchParams: Pick<URLSearchParams, "get">,
  fallback = "/home"
): string {
  const fromQuery =
    searchParams.get("returnTo") ?? searchParams.get("redirect");
  if (fromQuery) return sanitizeReturnTo(fromQuery);

  if (typeof window === "undefined") return sanitizeReturnTo(fallback);

  try {
    const stored = window.sessionStorage.getItem("classmate_oauth_return_to");
    if (stored) {
      window.sessionStorage.removeItem("classmate_oauth_return_to");
      return sanitizeReturnTo(stored);
    }
  } catch {
    // ignore
  }

  return sanitizeReturnTo(fallback);
}
