"use client";

import { buildLoginUrl, sanitizeReturnTo } from "@/lib/authAccount";
import {
  APP_LOGIN,
  APP_SETTINGS,
  buildAppLoginUrl,
  isAppShellPath,
} from "@/lib/appShell";
import {
  isAppShellContext,
  resolveAppShellReturnTo,
} from "@/lib/appShellContext";

/** ユーザー向けログイン URL（Web: /login、アプリ: /app/login） */
export function buildShellAwareLoginUrl(returnTo?: string): string {
  if (typeof window === "undefined") {
    return buildLoginUrl(returnTo);
  }

  if (!isAppShellContext()) {
    return buildLoginUrl(returnTo);
  }

  const path = resolveAppShellReturnTo(returnTo);
  if (isAppShellPath(path)) {
    return buildAppLoginUrl(path);
  }

  return `${APP_LOGIN}?returnTo=${encodeURIComponent(path)}`;
}

/** ユーザー向け設定 URL（Web: /settings、アプリ: /app/settings） */
export function buildShellAwareSettingsUrl(): string {
  return isAppShellContext() ? APP_SETTINGS : "/settings";
}

/**
 * API が返す Web 向け redirectTo（/login?returnTo=...）を
 * アプリ文脈では /app/login に寄せる。
 */
export function resolveAuthRedirectTo(
  url: string | null | undefined,
  fallbackReturnTo?: string
): string {
  const fallback = sanitizeReturnTo(fallbackReturnTo ?? "/home");

  if (typeof window === "undefined") {
    return String(url ?? "").trim() || buildLoginUrl(fallback);
  }

  const raw = String(url ?? "").trim();
  if (!raw) {
    return buildShellAwareLoginUrl(fallback);
  }

  if (raw.startsWith(APP_LOGIN)) {
    return raw;
  }

  if (raw.startsWith("/login")) {
    try {
      const parsed = new URL(raw, window.location.origin);
      const returnTo = parsed.searchParams.get("returnTo") ?? fallback;
      return buildShellAwareLoginUrl(returnTo);
    } catch {
      return buildShellAwareLoginUrl(fallback);
    }
  }

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (isAppShellContext() && !isAppShellPath(raw.split("?")[0] ?? raw)) {
      return buildShellAwareLoginUrl(raw.split("?")[0]);
    }
    return raw;
  }

  return raw;
}
