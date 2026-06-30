export function isAuthProviderDisabledError(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase();
  return (
    normalized.includes("provider is not enabled") ||
    normalized.includes("unsupported provider") ||
    normalized.includes("validation_failed")
  );
}

export function formatAuthProviderError(message: string): string {
  const raw = String(message ?? "").trim();
  if (!raw) {
    return "ログインに失敗しました。もう一度お試しください。";
  }

  if (isAuthProviderDisabledError(raw)) {
    return (
      "Google ログインがまだ有効になっていません。管理者は Supabase の " +
      "Authentication → Providers → Google を ON にし、Client ID / Secret と " +
      "リダイレクト URL（https://classmate-room.com/auth/callback**、iOS アプリ用 classmate://auth/callback）を設定してください。"
    );
  }

  try {
    const parsed = JSON.parse(raw) as {
      msg?: string;
      error_code?: string;
      message?: string;
    };
    const nested = String(parsed.msg ?? parsed.message ?? "").trim();
    if (nested && isAuthProviderDisabledError(nested)) {
      return formatAuthProviderError(nested);
    }
    if (nested) return nested;
  } catch {
    // not JSON
  }

  return raw;
}

export function readOAuthCallbackError(
  searchParams: Pick<URLSearchParams, "get">
): string | null {
  const description = String(searchParams.get("error_description") ?? "").trim();
  if (description) return formatAuthProviderError(description);

  const code = String(searchParams.get("error") ?? "").trim();
  if (code && code !== "access_denied") {
    return formatAuthProviderError(code);
  }

  if (code === "access_denied") {
    return "Google ログインがキャンセルされました。";
  }

  return null;
}
