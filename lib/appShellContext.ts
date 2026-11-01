"use client";

import { isCapacitorNativeApp } from "@/lib/capacitorClient";
import {
  APP_HOME,
  APP_LOGIN,
  APP_SETTINGS,
  isAppShellPath,
} from "@/lib/appShell";
import { sanitizeReturnTo } from "@/lib/authAccount";

export const APP_CONTEXT_KEY = "classmate_app_context";

/** Capacitor /app 利用時に sessionStorage へアプリ文脈を記録 */
export function markAppShellContext(): void {
  if (typeof window === "undefined") return;
  try {
    if (
      isCapacitorNativeApp() ||
      isAppShellPath(window.location.pathname)
    ) {
      sessionStorage.setItem(APP_CONTEXT_KEY, "1");
    }
  } catch {
    // ignore
  }
}

/** 一度でもアプリ専用導線に入ったか（Capacitor または /app/* 経由） */
export function isAppShellContext(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (sessionStorage.getItem(APP_CONTEXT_KEY) === "1") return true;
  } catch {
    // ignore
  }

  return isCapacitorNativeApp();
}

/** Room / Call / class select から戻るダッシュボード */
export function resolveShellDashboardPath(): string {
  return isAppShellContext() ? APP_HOME : "/";
}

/** Home section id for マイクラス (hash target). */
export const HOME_MY_CLASS_SECTION_ID = "cm-home-my-class";

/**
 * Legacy “mine page” path — now the home dashboard.
 * Prefer {@link resolveShellMyClassHref} when scrolling to マイクラス.
 */
export function resolveShellMinePath(): string {
  return resolveShellDashboardPath();
}

/**
 * Home URL that lands on the マイクラス section.
 * Append hash after withDev() so ?dev= stays on the path, not the fragment.
 */
export function resolveShellMyClassHref(): string {
  return `${resolveShellDashboardPath()}#${HOME_MY_CLASS_SECTION_ID}`;
}

/** withDev-safe href to the home マイクラス section. */
export function withDevMyClassHref(): string {
  return `${withDevSafePath(resolveShellDashboardPath())}#${HOME_MY_CLASS_SECTION_ID}`;
}

function withDevSafePath(path: string): string {
  if (typeof window === "undefined") return path;
  try {
    const params = new URLSearchParams(window.location.search);
    const dev = params.get("dev");
    if (!dev) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}dev=${encodeURIComponent(dev)}`;
  } catch {
    return path;
  }
}

function remapWebHomePath(path: string): string {
  const base = path.split("?")[0] ?? path;
  if (base === "/" || base === "/home") return APP_HOME;
  if (base === "/settings") return APP_SETTINGS;
  if (base === "/login") {
    const query = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    return query ? `${APP_LOGIN}${query}` : APP_LOGIN;
  }
  return path;
}

/**
 * Capacitor アプリ内では /home・/ を /app/home に寄せる。
 * 通常 Web ブラウザでは sanitizeReturnTo の挙動を変えない。
 */
export function resolveAppShellReturnTo(
  value?: unknown,
  fallback?: string
): string {
  const webFallback = fallback ?? "/home";
  const effectiveFallback = isAppShellContext() ? APP_HOME : webFallback;
  const sanitized = sanitizeReturnTo(value ?? effectiveFallback, effectiveFallback);

  if (!isAppShellContext()) return sanitized;
  return remapWebHomePath(sanitized);
}

export function defaultAuthCallbackReturnTo(): string {
  return isAppShellContext() ? APP_HOME : "/home";
}
