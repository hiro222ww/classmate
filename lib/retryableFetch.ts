import { debugVoiceRetryable } from "@/lib/debugVoiceLog";

export type FetchRetryKind =
  | "send"
  | "poll"
  | "reconnect"
  | "cleanup"
  | "members"
  | "turn"
  | "generic";

export type FetchRetryLogContext = {
  kind: FetchRetryKind;
  method?: string;
  url?: string;
  signalType?: string;
  retryCount?: number;
  retryable?: boolean;
  elapsedMs?: number;
};

function readErrorFields(error: unknown): { name: string; message: string } {
  if (!error || typeof error !== "object") {
    return { name: "Error", message: String(error ?? "unknown") };
  }
  const err = error as { name?: string; message?: string };
  return {
    name: String(err.name ?? "Error"),
    message: String(err.message ?? "unknown"),
  };
}

export function isIntentionalAbortError(
  error: unknown,
  opts?: { aborted?: boolean }
): boolean {
  if (opts?.aborted) return true;
  const { name, message } = readErrorFields(error);
  if (name !== "AbortError") return false;
  return (
    message.includes("aborted") ||
    message.includes("without reason") ||
    message === "The user aborted a request."
  );
}

export function isRetryableNetworkError(error: unknown): boolean {
  const { name, message } = readErrorFields(error);
  const lower = message.toLowerCase();

  if (name === "AbortError") return false;

  if (
    name === "TypeError" &&
    (lower.includes("load failed") ||
      lower.includes("failed to fetch") ||
      lower.includes("network"))
  ) {
    return true;
  }

  if (
    lower.includes("load failed") ||
    lower.includes("network error") ||
    lower.includes("network request failed") ||
    lower.includes("failed to fetch")
  ) {
    return true;
  }

  return false;
}

export function logFetchRetryEvent(
  context: FetchRetryLogContext,
  error?: unknown
): void {
  const fields = error ? readErrorFields(error) : { name: "-", message: "-" };
  const online =
    typeof navigator !== "undefined" && "onLine" in navigator
      ? navigator.onLine
      : "-";
  const visibility =
    typeof document !== "undefined" ? document.visibilityState : "-";

  const line =
    `kind=${context.kind} method=${context.method ?? "GET"} ` +
    `signalType=${context.signalType ?? "-"} elapsedMs=${context.elapsedMs ?? "-"} ` +
    `error.name=${fields.name} error.message=${fields.message} ` +
    `navigator.onLine=${online} visibility=${visibility} ` +
    `retryCount=${context.retryCount ?? 0} retryable=${context.retryable === true}`;

  debugVoiceRetryable(
    `fetch:${context.kind}:${context.signalType ?? "-"}`,
    line,
    {
      errorName: fields.name,
      errorMessage: fields.message,
      retryable: context.retryable === true,
    }
  );
}

export type FetchWithRetryOptions = {
  kind: FetchRetryKind;
  maxAttempts?: number;
  backoffMs?: number[];
  signalType?: string;
  aborted?: boolean;
  onAttemptError?: (params: {
    error: unknown;
    attempt: number;
    retryable: boolean;
    willRetry: boolean;
  }) => void;
};

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: FetchWithRetryOptions
): Promise<Response> {
  const kind = opts?.kind ?? "generic";
  const maxAttempts = opts?.maxAttempts ?? 3;
  const backoff = opts?.backoffMs ?? [250, 600];
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const method = init?.method ?? "GET";
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok || attempt >= maxAttempts - 1) {
        return res;
      }

      if (res.status >= 500) {
        lastError = new Error(`http_${res.status}`);
        const retryable = true;
        const willRetry = attempt < maxAttempts - 1;
        opts?.onAttemptError?.({
          error: lastError,
          attempt: attempt + 1,
          retryable,
          willRetry,
        });
        logFetchRetryEvent(
          {
            kind,
            method,
            url,
            signalType: opts?.signalType,
            retryCount: attempt + 1,
            retryable,
            elapsedMs: Math.round(
              (typeof performance !== "undefined"
                ? performance.now()
                : Date.now()) - startedAt
            ),
          },
          lastError
        );
        if (!willRetry) return res;
        await sleep(backoff[Math.min(attempt, backoff.length - 1)] ?? 600);
        continue;
      }

      return res;
    } catch (error) {
      lastError = error;
      if (isIntentionalAbortError(error, { aborted: opts?.aborted })) {
        throw error;
      }

      const retryable = isRetryableNetworkError(error);
      const willRetry = retryable && attempt < maxAttempts - 1;

      opts?.onAttemptError?.({
        error,
        attempt: attempt + 1,
        retryable,
        willRetry,
      });

      logFetchRetryEvent(
        {
          kind,
          method,
          url,
          signalType: opts?.signalType,
          retryCount: attempt + 1,
          retryable,
          elapsedMs: Math.round(
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) - startedAt
          ),
        },
        error
      );

      if (!willRetry) throw error;
      await sleep(backoff[Math.min(attempt, backoff.length - 1)] ?? 600);
    }
  }

  throw lastError ?? new Error("fetch_retry_exhausted");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
