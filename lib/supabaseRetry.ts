import { isRetryableNetworkError } from "@/lib/retryableFetch";

const DEFAULT_BACKOFF_MS = [250, 700, 1400] as const;

export const PROFILE_SAVE_NETWORK_USER_MESSAGE =
  "通信に失敗しました。回線状況を確認して、もう一度お試しください。";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function isRetryableSupabaseFailure(error: unknown): boolean {
  if (isRetryableNetworkError(error)) return true;
  if (typeof error === "string") return isRetryableNetworkError(error);
  if (error && typeof error === "object") {
    const message = String((error as { message?: unknown }).message ?? "");
    if (message && isRetryableNetworkError(message)) return true;
  }
  return false;
}

export function toUserFacingProfileSaveError(error: unknown): string {
  if (isRetryableSupabaseFailure(error)) {
    return PROFILE_SAVE_NETWORK_USER_MESSAGE;
  }

  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object"
        ? String((error as { message?: unknown }).message ?? "")
        : "";

  const trimmed = message.trim();
  if (!trimmed) return "保存に失敗しました。時間をおいて再試行してください。";

  // Never surface undici / low-level fetch internals to end users.
  if (/fetch failed|failed to fetch|load failed|und_err_|econnreset|enotfound/i.test(trimmed)) {
    return PROFILE_SAVE_NETWORK_USER_MESSAGE;
  }

  return trimmed;
}

export type WithSupabaseRetryOptions = {
  maxAttempts?: number;
  backoffMs?: number[];
  label?: string;
};

/**
 * Retry transient Supabase/network failures (thrown or `{ error }` results).
 */
export async function withSupabaseRetry<T>(
  operation: () => Promise<T>,
  opts?: WithSupabaseRetryOptions
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const backoff = opts?.backoffMs ?? [...DEFAULT_BACKOFF_MS];
  const label = opts?.label ?? "supabase";
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await operation();

      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        (result as { error?: { message?: string } | null }).error
      ) {
        const nested = (result as { error: { message?: string } }).error;
        if (isRetryableSupabaseFailure(nested) && attempt < maxAttempts - 1) {
          lastError = nested;
          console.warn("[supabase-retry] retryable result error", {
            label,
            attempt: attempt + 1,
            message: nested?.message ?? null,
          });
          await sleep(backoff[Math.min(attempt, backoff.length - 1)] ?? 700);
          continue;
        }
      }

      return result;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableSupabaseFailure(error);
      const willRetry = retryable && attempt < maxAttempts - 1;
      console.warn("[supabase-retry] attempt failed", {
        label,
        attempt: attempt + 1,
        retryable,
        willRetry,
        message: error instanceof Error ? error.message : String(error),
      });
      if (!willRetry) throw error;
      await sleep(backoff[Math.min(attempt, backoff.length - 1)] ?? 700);
    }
  }

  throw lastError ?? new Error("supabase_retry_exhausted");
}
