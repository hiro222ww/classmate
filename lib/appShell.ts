import { sanitizeReturnTo } from "@/lib/authAccount";

export const APP_ROOT = "/app";
export const APP_HOME = "/app/home";
export const APP_LOGIN = "/app/login";
export const APP_SETTINGS = "/app/settings";

export function isAppShellPath(pathname: string): boolean {
  const path = String(pathname ?? "").trim() || "/";
  return path === APP_ROOT || path.startsWith(`${APP_ROOT}/`);
}

export function buildAppLoginUrl(returnTo?: string): string {
  const path = sanitizeReturnTo(returnTo ?? APP_HOME, APP_HOME);
  return `${APP_LOGIN}?returnTo=${encodeURIComponent(path)}`;
}
