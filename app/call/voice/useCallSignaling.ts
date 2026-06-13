"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { compactDeviceId } from "@/app/call/voice/voiceDiagnostics";
import {
  classifySignalInsertError,
  logSignalInsertFailure,
  logSignalTransport,
  sleepMs,
} from "@/lib/signalTransportLog";
import { logVoicePipelineClassification } from "@/lib/voicePerf";

/** Must match `call_signals_signal_type_check` in Supabase (see migration 20260602100000). */
export const ALLOWED_CALL_SIGNAL_TYPES = [
  "offer",
  "answer",
  "ice",
  "leave",
  "reconnect-request",
] as const;

export type SignalType = (typeof ALLOWED_CALL_SIGNAL_TYPES)[number];

function isSignalTypeConstraintError(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "23514" &&
    String(error.message ?? "").includes("call_signals_signal_type_check")
  );
}

export type SignalPayload = {
  connectionId?: string;
  sdp?: RTCSessionDescriptionInit | null;
  candidate?: RTCIceCandidateInit | null;
  resetReason?: string;
  voiceEpoch?: number;
};

export type SignalRow = {
  id: number;
  session_id: string;
  from_device_id: string;
  to_device_id: string | null;
  signal_type: SignalType;
  payload: SignalPayload | null;
  created_at: string;
};

export type SendSignalResult = {
  ok: boolean;
  errorName?: string;
  errorMessage?: string;
  retryCount?: number;
};

type UseCallSignalingArgs = {
  sessionId: string;
  deviceId: string;
  onSignal: (row: SignalRow) => Promise<void> | void;
  onStatusChange?: (text: string) => void;
};

const SIGNAL_INSERT_MAX_ATTEMPTS = 3;
const SIGNAL_INSERT_BACKOFF_MS = [200, 450];

export function useCallSignaling({
  sessionId,
  deviceId,
  onSignal,
  onStatusChange,
}: UseCallSignalingArgs) {
  const [signalReady, setSignalReady] = useState(false);
  const signalReadyRef = useRef(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const onSignalRef = useRef<(row: SignalRow) => Promise<void> | void>(() => {});
  const aliveRef = useRef(true);
  const channelResubscribeAttemptsRef = useRef(0);

  useEffect(() => {
    signalReadyRef.current = signalReady;
  }, [signalReady]);

  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (!sessionId || !deviceId || signalReady) return;
    const timer = window.setTimeout(() => {
      if (!signalReadyRef.current) {
        logSignalTransport({
          kind: "subscribe",
          method: "realtime.subscribe",
          extra: "signalReady_false_class=B",
        });
        logVoicePipelineClassification(undefined, "signalReady-false-long");
      }
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [sessionId, deviceId, signalReady]);

  const setOnSignal = useCallback(
    (next: (row: SignalRow) => Promise<void> | void) => {
      onSignalRef.current = next;
    },
    []
  );

  const sendSignal = useCallback(
    async (
      toDeviceId: string | null,
      signalType: SignalType,
      payload: SignalPayload
    ): Promise<SendSignalResult> => {
      if (!sessionId || !deviceId) {
        return {
          ok: false,
          errorName: "MissingContext",
          errorMessage: "session_or_device_missing",
        };
      }

      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const remote = compactDeviceId(toDeviceId);
      let lastErrorName = "SignalInsertError";
      let lastErrorMessage = "insert_failed";

      for (let attempt = 0; attempt < SIGNAL_INSERT_MAX_ATTEMPTS; attempt++) {
        if (!aliveRef.current) {
          return {
            ok: false,
            errorName: "Aborted",
            errorMessage: "signaling_unmounted",
            retryCount: attempt,
          };
        }

        try {
          const { error } = await supabase.from("call_signals").insert({
            session_id: sessionId,
            from_device_id: deviceId,
            to_device_id: toDeviceId,
            signal_type: signalType,
            payload,
          });

          if (!error) {
            if (attempt > 0) {
              logSignalTransport({
                kind: "send",
                signalType,
                remoteDeviceId: toDeviceId,
                retryCount: attempt,
                retryable: true,
                elapsedMs: Math.round(
                  (typeof performance !== "undefined"
                    ? performance.now()
                    : Date.now()) - startedAt
                ),
                extra: "recovered_after_retry",
              });
            }
            return { ok: true, retryCount: attempt };
          }

          lastErrorName = error.name ?? "SignalInsertError";
          lastErrorMessage = error.message ?? "insert_failed";

          const retryable =
            classifySignalInsertError(error).retryable &&
            attempt < SIGNAL_INSERT_MAX_ATTEMPTS - 1;

          logSignalInsertFailure({
            signalType,
            remoteDeviceId: toDeviceId,
            error,
            retryCount: attempt + 1,
            retryable,
            elapsedMs: Math.round(
              (typeof performance !== "undefined"
                ? performance.now()
                : Date.now()) - startedAt
            ),
          });

          if (isSignalTypeConstraintError(error)) {
            console.error(
              `[voice-signal] allowed-types-mismatch type=${signalType} ` +
                `allowed=${ALLOWED_CALL_SIGNAL_TYPES.join(",")}`
            );
          }

          if (!retryable) {
            if (!isSignalTypeConstraintError(error)) {
              onStatusChange?.(`signal error: ${error.message}`);
            }
            return {
              ok: false,
              errorName: lastErrorName,
              errorMessage: lastErrorMessage,
              retryCount: attempt + 1,
            };
          }

          await sleepMs(
            SIGNAL_INSERT_BACKOFF_MS[
              Math.min(attempt, SIGNAL_INSERT_BACKOFF_MS.length - 1)
            ] ?? 450
          );
          continue;
        } catch (e: unknown) {
          const classified = classifySignalInsertError(e);
          const err = e as { name?: string; message?: string };
          lastErrorName = err?.name ?? "SignalInsertException";
          lastErrorMessage = err?.message ?? String(e);

          if (classified.intentionalAbort) {
            logSignalTransport({
              kind: "cleanup",
              signalType,
              remoteDeviceId: toDeviceId,
              error: e,
              retryable: false,
              extra: "intentional_abort",
            });
            return {
              ok: false,
              errorName: lastErrorName,
              errorMessage: lastErrorMessage,
              retryCount: attempt,
            };
          }

          const retryable =
            classified.retryable && attempt < SIGNAL_INSERT_MAX_ATTEMPTS - 1;

          logSignalInsertFailure({
            signalType,
            remoteDeviceId: toDeviceId,
            error: e,
            retryCount: attempt + 1,
            retryable,
            elapsedMs: Math.round(
              (typeof performance !== "undefined"
                ? performance.now()
                : Date.now()) - startedAt
            ),
          });

          if (!retryable) {
            if (classified.retryable) {
              onStatusChange?.(`signal error: ${lastErrorMessage}`);
            }
            return {
              ok: false,
              errorName: lastErrorName,
              errorMessage: lastErrorMessage,
              retryCount: attempt + 1,
            };
          }

          await sleepMs(
            SIGNAL_INSERT_BACKOFF_MS[
              Math.min(attempt, SIGNAL_INSERT_BACKOFF_MS.length - 1)
            ] ?? 450
          );
        }
      }

      return {
        ok: false,
        errorName: lastErrorName,
        errorMessage: lastErrorMessage,
        retryCount: SIGNAL_INSERT_MAX_ATTEMPTS,
      };
    },
    [sessionId, deviceId, onStatusChange]
  );

  useEffect(() => {
    aliveRef.current = true;
    channelResubscribeAttemptsRef.current = 0;

    if (!sessionId || !deviceId) {
      setSignalReady(false);
      return;
    }

    let disposed = false;

    const removeCurrentChannel = () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };

    const subscribeChannel = () => {
      if (disposed) return;

      removeCurrentChannel();
      setSignalReady(false);

      const channel = supabase
        .channel(`call-signals-${sessionId}-${deviceId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "call_signals",
            filter: `session_id=eq.${sessionId}`,
          },
          async (payload) => {
            if (!aliveRef.current || disposed) return;

            const row = payload.new as SignalRow;
            try {
              await onSignalRef.current(row);
            } catch (e) {
              logSignalTransport({
                kind: "receive",
                signalType: row.signal_type,
                remoteDeviceId: row.from_device_id,
                error: e,
                retryable: false,
                extra: "handler_exception",
              });
            }
          }
        )
        .subscribe((status) => {
          if (!aliveRef.current || disposed) return;

          logSignalTransport({
            kind: "subscribe",
            method: "realtime.subscribe",
            extra: `status=${status}`,
          });

          if (status === "SUBSCRIBED") {
            channelResubscribeAttemptsRef.current = 0;
            setSignalReady(true);
            return;
          }

          if (
            status === "CLOSED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            setSignalReady(false);

            if (
              !disposed &&
              channelResubscribeAttemptsRef.current < 2
            ) {
              channelResubscribeAttemptsRef.current += 1;
              const attempt = channelResubscribeAttemptsRef.current;
              logSignalTransport({
                kind: "reconnect",
                method: "realtime.resubscribe",
                retryCount: attempt,
                retryable: true,
                extra: `status=${status}`,
              });
              void sleepMs(300 * attempt).then(() => {
                if (!disposed && aliveRef.current) {
                  subscribeChannel();
                }
              });
              return;
            }

            if (!disposed && aliveRef.current) {
              logSignalTransport({
                kind: "reconnect",
                method: "realtime.resubscribe",
                retryCount: channelResubscribeAttemptsRef.current,
                retryable: true,
                extra: `status=${status} exhausted_reset`,
              });
              channelResubscribeAttemptsRef.current = 0;
              void sleepMs(2000).then(() => {
                if (!disposed && aliveRef.current) {
                  subscribeChannel();
                }
              });
            }
          }
        });

      channelRef.current = channel;
    };

    subscribeChannel();

    return () => {
      disposed = true;
      aliveRef.current = false;
      setSignalReady(false);
      logSignalTransport({ kind: "cleanup", extra: "signaling_effect_dispose" });
      removeCurrentChannel();
    };
  }, [sessionId, deviceId]);

  return {
    signalReady,
    sendSignal,
    setOnSignal,
  };
}
