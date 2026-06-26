/** Account auth helpers — safe for client and server imports (no Supabase admin). */

export const LOGIN_REQUIRED_MESSAGE =
  "続行するには Google でログインしてください。";

export function sanitizeReturnTo(value: unknown, fallback = "/home"): string {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

export function buildLoginUrl(returnTo?: string): string {
  const path = sanitizeReturnTo(returnTo ?? "/home");
  return `/login?returnTo=${encodeURIComponent(path)}`;
}

export function isLoggedInAccount(status: {
  isAnonymous?: boolean | null;
  hasLinkedEmail?: boolean | null;
} | null | undefined): boolean {
  if (!status) return false;
  return status.isAnonymous !== true;
}

export function accountStatusLabel(status: {
  isAnonymous?: boolean | null;
  hasLinkedEmail?: boolean | null;
  email?: string | null;
} | null | undefined): string {
  if (!status) return "未ログイン";
  if (isLoggedInAccount(status)) {
    return String(status.email ?? "").trim() || "ログイン済み";
  }
  if (status.isAnonymous) return "未ログイン";
  return "メール確認待ち";
}
