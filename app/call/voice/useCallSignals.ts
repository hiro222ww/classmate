import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { callLog, callWarn } from "./debug";
import type { SignalRow } from "./types";

export function useCallSignals(params: {
  sessionId: string;
  deviceId: string;
  onSignal: (row: SignalRow) => Promise<void> | void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const { sessionId, deviceId, onSignal, onReadyChange } = params;

  const [signalReady, setSignalReady] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const onSignalRef = useRef<(row: SignalRow) => Promise<void> | void>(() => {});

  function updateReady(ready: boolean) {
    setSignalReady(ready);
    onReadyChange?.(ready);
  }

  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (!sessionId || !deviceId) {
      updateReady(false);
      return;
    }

    let alive = true;

    updateReady(false);

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    callLog("🔥 SUBSCRIBE CREATED", { sessionId, deviceId });

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
          if (!alive) return;

          const row = payload.new as SignalRow;
          await onSignalRef.current(row);
        }
      )
      .subscribe((status) => {
        callLog("[call] signal subscribe status", status);

        if (!alive) return;

        if (status === "SUBSCRIBED") {
          updateReady(true);
          return;
        }

        if (
          status === "CLOSED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          callWarn("[call] signal channel dead", status);
          updateReady(false);
        }
      });

    channelRef.current = channel;

    return () => {
      alive = false;
      updateReady(false);

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, deviceId, onReadyChange]);

  return {
    signalReady,
  };
}