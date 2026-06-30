"use client";

import { buildLoginUrl } from "@/lib/authAccount";
import {
  APP_LOGIN,
  buildAppLoginUrl,
  isAppShellPath,
} from "@/lib/appShell";
import {
  isAppShellContext,
  resolveAppShellReturnTo,
} from "@/lib/appShellContext";

/** アプリ文脈では /app/login、通常 Web では /login */
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
