import { isRetryableNetworkError } from "@/lib/retryableFetch";

const DEFAULT_BACKOFF_MS = [250, 700, 1400] as const;

/** Client-side connectivity issues (device offline, etc.). */
export const PROFILE_SAVE_NETWORK_USER_MESSAGE =
  "通信に失敗しました。回線状況を確認して、もう一度お試しください。";

/**
 * Server could not reach the database / Supabase backend.
 * Prefer this over blaming the user's device network.
 */
export const PROFILE_SAVE_SERVER_UNAVAILABLE_MESSAGE =
  "ただいま登録サーバーに接続できません。しばらくしてからもう一度お試しください。";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function readErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    return String((error as { message?: unknown }).message ?? "");
  }
  return "";
}

export function isRetryableSupabaseFailure(error: unknown): boolean {
  if (isRetryableNetworkError(error)) return true;
  const message = readErrorMessage(error);
  if (message && isRetryableNetworkError(message)) return true;
  return false;
}

export function toUserFacingProfileSaveError(
  error: unknown,
  opts?: { source?: "client" | "server" }
): string {
  const message = readErrorMessage(error).trim();
  const lower = message.toLowerCase();
  const looksLikeBackendUnreachable =
    /fetch failed|und_err_|econnreset|enotfound|eai_again|connect timeout|getaddrinfo/i.test(
      lower
    );

  if (opts?.source === "server" || looksLikeBackendUnreachable) {
    if (isRetryableSupabaseFailure(error) || looksLikeBackendUnreachable) {
      return PROFILE_SAVE_SERVER_UNAVAILABLE_MESSAGE;
    }
  }

  if (isRetryableSupabaseFailure(error)) {
    return opts?.source === "client"
      ? PROFILE_SAVE_NETWORK_USER_MESSAGE
      : PROFILE_SAVE_SERVER_UNAVAILABLE_MESSAGE;
  }

  if (!message) return "保存に失敗しました。時間をおいて再試行してください。";

  // Never surface undici / low-level fetch internals to end users.
  if (/fetch failed|failed to fetch|load failed|und_err_|econnreset|enotfound/i.test(message)) {
    return PROFILE_SAVE_SERVER_UNAVAILABLE_MESSAGE;
  }

  return message;
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
  operation: () => PromiseLike<T> | T,
  opts?: WithSupabaseRetryOptions
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const backoff = opts?.backoffMs ?? [...DEFAULT_BACKOFF_MS];
  const label = opts?.label ?? "supabase";
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await Promise.resolve(operation());

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
