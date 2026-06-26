export function isEmailRateLimitError(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase();
  return (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("over_email_send_rate_limit") ||
    normalized.includes("email rate limit")
  );
}

export function isEmailAlreadyRegisteredError(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase();
  return (
    normalized.includes("already") ||
    normalized.includes("registered") ||
    normalized.includes("exists") ||
    normalized.includes("user already")
  );
}

export function formatAuthEmailError(message: string): string {
  if (isEmailRateLimitError(message)) {
    return "メールの送信回数が上限に達しました。数分待ってから再度お試しください。";
  }
  return message;
}

export const AUTH_EMAIL_RESEND_COOLDOWN_MS = 60_000;
const AUTH_EMAIL_RESEND_KEY = "classmate_auth_email_sent_at";

export function checkAuthEmailResendCooldown(email: string):
  | { ok: true }
  | { ok: false; waitSeconds: number } {
  if (typeof window === "undefined") return { ok: true };

  try {
    const raw = localStorage.getItem(AUTH_EMAIL_RESEND_KEY);
    if (!raw) return { ok: true };

    const parsed = JSON.parse(raw) as { email?: string; at?: number };
    if (String(parsed.email ?? "").toLowerCase() !== email.toLowerCase()) {
      return { ok: true };
    }

    const elapsed = Date.now() - Number(parsed.at ?? 0);
    if (elapsed < AUTH_EMAIL_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        waitSeconds: Math.ceil((AUTH_EMAIL_RESEND_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  } catch {
    return { ok: true };
  }

  return { ok: true };
}

export function markAuthEmailSent(email: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      AUTH_EMAIL_RESEND_KEY,
      JSON.stringify({ email: email.toLowerCase(), at: Date.now() })
    );
  } catch {
    // ignore storage errors
  }
}

export function authEmailResendCooldownMessage(waitSeconds: number): string {
  return `メールは ${waitSeconds} 秒後に再送できます。届かない場合は迷惑メールフォルダもご確認ください。`;
}
