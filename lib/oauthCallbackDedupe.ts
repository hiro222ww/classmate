"use client";

const PROCESSING_CODE_KEY = "classmate_oauth_callback_processing_code";
const CONSUMED_CODE_PREFIX = "classmate_oauth_code_consumed:";
const HANDLED_NATIVE_URL_KEY = "classmate_oauth_handled_native_url";
const PENDING_NATIVE_OAUTH_URL_KEY = "classmate_oauth_pending_native_url";
const CALLBACK_ACTIVE_KEY = "classmate_oauth_callback_active";

export function readOAuthCodeFromLocation(
  search = typeof window !== "undefined" ? window.location.search : "",
  hash = typeof window !== "undefined" ? window.location.hash : ""
): string | null {
  try {
    const fromSearch = new URLSearchParams(search).get("code");
    if (fromSearch) return fromSearch;
    if (hash.includes("code=")) {
      const hashQuery = hash.startsWith("#") ? hash.slice(1) : hash;
      return new URLSearchParams(hashQuery).get("code");
    }
  } catch {
    return null;
  }
  return null;
}

export function isOAuthCodeConsumed(code: string): boolean {
  if (!code || typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(`${CONSUMED_CODE_PREFIX}${code}`) === "1";
  } catch {
    return false;
  }
}

export function markOAuthCodeConsumed(code: string): void {
  if (!code || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${CONSUMED_CODE_PREFIX}${code}`, "1");
    sessionStorage.removeItem(PROCESSING_CODE_KEY);
  } catch {
    // ignore
  }
}

/** 同一 code の同時 exchange を防ぐ。true = この呼び出しが処理担当 */
export function claimOAuthCallbackProcessing(code: string): boolean {
  if (!code || typeof window === "undefined") return false;
  if (isOAuthCodeConsumed(code)) return false;
  try {
    const current = sessionStorage.getItem(PROCESSING_CODE_KEY);
    if (current === code) return false;
    if (current && current !== code) return false;
    sessionStorage.setItem(PROCESSING_CODE_KEY, code);
    return true;
  } catch {
    return true;
  }
}

export function releaseOAuthCallbackProcessing(code: string): void {
  if (!code || typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(PROCESSING_CODE_KEY) === code) {
      sessionStorage.removeItem(PROCESSING_CODE_KEY);
    }
  } catch {
    // ignore
  }
}

export function isOAuthCallbackProcessing(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(sessionStorage.getItem(PROCESSING_CODE_KEY));
  } catch {
    return false;
  }
}

export function markAuthCallbackActive(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CALLBACK_ACTIVE_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearAuthCallbackActive(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CALLBACK_ACTIVE_KEY);
  } catch {
    // ignore
  }
}

export function isAuthCallbackActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(CALLBACK_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

/** classmate://... を JS 側で Web へ橋渡しする（login 画面では再試行を許可） */
export function shouldHandleNativeAuthReturnUrl(nativeUrl: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const path = window.location.pathname;
    const last = sessionStorage.getItem(HANDLED_NATIVE_URL_KEY);
    if (last === nativeUrl) return false;

    if (path === "/app/login" || path.startsWith("/app/login")) {
      sessionStorage.setItem(HANDLED_NATIVE_URL_KEY, nativeUrl);
      return true;
    }
    if (path === "/auth/callback" || path.startsWith("/auth/callback")) {
      sessionStorage.setItem(HANDLED_NATIVE_URL_KEY, nativeUrl);
      return true;
    }
    sessionStorage.setItem(HANDLED_NATIVE_URL_KEY, nativeUrl);
    return true;
  } catch {
    return true;
  }
}

export function stashPendingNativeOAuthUrl(nativeUrl: string): void {
  if (!nativeUrl || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_NATIVE_OAUTH_URL_KEY, nativeUrl);
  } catch {
    // ignore
  }
}

export function readPendingNativeOAuthUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(PENDING_NATIVE_OAUTH_URL_KEY);
  } catch {
    return null;
  }
}

export function clearPendingNativeOAuthUrl(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_NATIVE_OAUTH_URL_KEY);
  } catch {
    // ignore
  }
}

export function clearHandledNativeAuthReturnUrl(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(HANDLED_NATIVE_URL_KEY);
  } catch {
    // ignore
  }
}

/** 成功後に URL から code / error 等を除去（returnTo は残す） */
export function stripOAuthParamsFromBrowserUrl(keepReturnTo?: string | null): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  const returnTo =
    keepReturnTo ??
    new URLSearchParams(window.location.search).get("returnTo");
  if (returnTo) params.set("returnTo", returnTo);
  const query = params.toString();
  const next = `/auth/callback${query ? `?${query}` : ""}`;
  window.history.replaceState(window.history.state, "", next);
}

export function isSameAuthCallbackHref(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return (
      left.pathname === right.pathname &&
      left.search === right.search &&
      left.hash === right.hash
    );
  } catch {
    return a === b;
  }
}
