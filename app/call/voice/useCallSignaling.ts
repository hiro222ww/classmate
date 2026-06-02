"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type SignalType =
  | "offer"
  | "answer"
  | "ice"
  | "leave"
  | "reconnect-request";

export type SignalPayload = {
  connectionId?: string;
  sdp?: RTCSessionDescriptionInit | null;
  candidate?: RTCIceCandidateInit | null;
  resetReason?: string;
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

type UseCallSignalingArgs = {
  sessionId: string;
  deviceId: string;
  onSignal: (row: SignalRow) => Promise<void> | void;
  onStatusChange?: (text: string) => void;
};

export function useCallSignaling({
  sessionId,
  deviceId,
  onSignal,
  onStatusChange,
}: UseCallSignalingArgs) {
  const [signalReady, setSignalReady] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const onSignalRef = useRef<(row: SignalRow) => Promise<void> | void>(() => {});

  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);

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
    ) => {
      if (!sessionId || !deviceId) return;

      const { error } = await supabase.from("call_signals").insert({
        session_id: sessionId,
        from_device_id: deviceId,
        to_device_id: toDeviceId,
        signal_type: signalType,
        payload,
      });

      if (error) {
        console.error("[call] signal insert error", error);
        onStatusChange?.(`signal error: ${error.message}`);
      }
    },
    [sessionId, deviceId, onStatusChange]
  );

  useEffect(() => {
    console.log("[voice-signaling] effect check", {
      sessionId,
      deviceId,
    });

    if (!sessionId || !deviceId) return;

    let alive = true;

    setSignalReady(false);

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

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
        if (!alive) return;

        console.log("[voice-signaling] subscribe status", {
          sessionId,
          deviceId,
          status,
        });

        if (status === "SUBSCRIBED") {
          setSignalReady(true);
          return;
        }

        if (
          status === "CLOSED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          setSignalReady(false);
        }
      });

    channelRef.current = channel;

    return () => {
      alive = false;
      setSignalReady(false);

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, deviceId]);

  return {
    signalReady,
    sendSignal,
    setOnSignal,
  };
}