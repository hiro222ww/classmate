import { accountStatusLabel, isLoggedInAccount } from "@/lib/authAccount";

/** Shared client auth gate — independent of Google profile fetch success. */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/** Show slow-loading hint after this many ms while still resolving auth. */
export const AUTH_RESOLVE_SLOW_MS = 8_000;

export type AuthAccountSnapshot = {
  userId: string;
  deviceId: string;
  email: string | null;
  isAnonymous: boolean;
  hasLinkedEmail: boolean;
  entitlements: {
    plan: string;
    class_slots: number;
    can_create_classes: boolean;
    topic_plan: number;
    theme_pass: boolean;
  } | null;
};

export function resolveAuthStatusFromAccount(
  account: AuthAccountSnapshot | null | undefined
): Exclude<AuthStatus, "loading"> {
  if (!account) return "unauthenticated";
  return isLoggedInAccount(account) ? "authenticated" : "unauthenticated";
}

export function authAccountLabel(
  status: AuthStatus,
  account: AuthAccountSnapshot | null | undefined
): string {
  if (status === "loading") return "確認中…";
  if (status === "authenticated") {
    return accountStatusLabel(account) || "ログイン済み";
  }
  return "Google でログイン";
}

export function isAuthReady(status: AuthStatus): boolean {
  return status !== "loading";
}

export function isAuthLoggedIn(status: AuthStatus): boolean {
  return status === "authenticated";
}
