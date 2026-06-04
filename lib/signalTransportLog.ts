import { compactDeviceId } from "@/app/call/voice/voiceDiagnostics";
import { debugConsoleLog, debugVoiceRetryable } from "@/lib/debugVoiceLog";
import {
  isIntentionalAbortError,
  isRetryableNetworkError,
  logFetchRetryEvent,
  type FetchRetryKind,
} from "@/lib/retryableFetch";

export type SignalTransportKind = FetchRetryKind | "subscribe" | "receive";

export type SignalTransportLogInput = {
  kind: SignalTransportKind;
  signalType?: string;
  method?: string;
  elapsedMs?: number;
  error?: unknown;
  retryCount?: number;
  retryable?: boolean;
  remoteDeviceId?: string | null;
  extra?: string;
};

export function logSignalTransport(input: SignalTransportLogInput): void {
  const fields =
    input.error && typeof input.error === "object"
      ? {
          name: String((input.error as { name?: string }).name ?? "Error"),
          message: String(
            (input.error as { message?: string }).message ?? "unknown"
          ),
        }
      : { name: "-", message: "-" };

  const online =
    typeof navigator !== "undefined" && "onLine" in navigator
      ? navigator.onLine
      : "-";
  const visibility =
    typeof document !== "undefined" ? document.visibilityState : "-";

  const level = input.error ? "warn" : "log";
  const remote = compactDeviceId(input.remoteDeviceId);

  const line =
    `[voice-signal] kind=${input.kind} signalType=${input.signalType ?? "-"} ` +
    `method=${input.method ?? "supabase.insert"} elapsedMs=${input.elapsedMs ?? "-"} ` +
    `error.name=${fields.name} error.message=${fields.message} ` +
    `navigator.onLine=${online} visibility=${visibility} ` +
    `retryCount=${input.retryCount ?? 0} retryable=${input.retryable === true} ` +
    `remote=${remote} extra=${input.extra ?? "-"}`;

  if (level === "warn") {
    if (input.retryable) {
      debugVoiceRetryable(
        `signal:${input.kind}:${input.signalType ?? "-"}`,
        line
      );
    } else {
      console.warn(line);
    }
    return;
  }
  debugConsoleLog(line);
}

export function classifySignalInsertError(error: unknown): {
  retryable: boolean;
  intentionalAbort: boolean;
} {
  const intentionalAbort = isIntentionalAbortError(error);
  if (intentionalAbort) {
    return { retryable: false, intentionalAbort: true };
  }
  return {
    retryable: isRetryableNetworkError(error),
    intentionalAbort: false,
  };
}

export async function sleepMs(ms: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function logSignalInsertFailure(
  input: Omit<SignalTransportLogInput, "kind"> & { kind?: SignalTransportKind }
) {
  logSignalTransport({ kind: "send", ...input });
  logFetchRetryEvent(
    {
      kind: "send",
      method: input.method ?? "supabase.insert",
      signalType: input.signalType,
      retryCount: input.retryCount,
      retryable: input.retryable,
      elapsedMs: input.elapsedMs,
    },
    input.error
  );
}
