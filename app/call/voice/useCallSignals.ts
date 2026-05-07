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
  const onReadyChangeRef = useRef<((ready: boolean) => void) | undefined>(
    undefined
  );

  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  function updateReady(ready: boolean) {
    setSignalReady(ready);
    onReadyChangeRef.current?.(ready);
  }

  async function loadRecentSignals() {
    if (!sessionId || !deviceId) return;

    const since = new Date(Date.now() - 30_000).toISOString();

    const { data, error } = await supabase
      .from("call_signals")
      .select("*")
      .eq("session_id", sessionId)
      .gte("created_at", since)
      .neq("from_device_id", deviceId)
      .or(`to_device_id.eq.${deviceId},to_device_id.is.null`)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      callWarn("[call] recent signals load failed", error);
      return;
    }

    for (const row of (data ?? []) as SignalRow[]) {
      await onSignalRef.current(row);
    }
  }

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

          // 🔥 購読前に送られた offer / answer / ice を取り戻す
          void loadRecentSignals();

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
  }, [sessionId, deviceId]);

  return {
    signalReady,
  };
}