import { useCallback, useRef } from "react";
import { FALLBACK_ICE_SERVERS } from "./voiceConstants";
import { callWarn } from "./debug";
import type { VoiceRoute } from "./types";

export function useTurnFallback(params: {
  turnFallbackEnabled: boolean;
}) {
  const { turnFallbackEnabled } = params;

  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);
  const voiceRouteRef = useRef<VoiceRoute>("stun");
  const turnIceServersRef = useRef<RTCIceServer[] | null>(null);
  const loadingTurnRef = useRef(false);

  const enableTurnFallback = useCallback(async () => {
    if (!turnFallbackEnabled) {
      callWarn("[call] TURN fallback disabled by admin setting");
      return false;
    }

    if (voiceRouteRef.current === "turn") return true;

    if (turnIceServersRef.current && turnIceServersRef.current.length > 0) {
      voiceRouteRef.current = "turn";
      iceServersRef.current = turnIceServersRef.current;
      return true;
    }

    if (loadingTurnRef.current) return false;

    loadingTurnRef.current = true;

    try {
      const res = await fetch("/api/turn", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();

      const nextIceServers = Array.isArray(data?.ice_servers)
        ? data.ice_servers
        : Array.isArray(data?.iceServers)
          ? data.iceServers
          : null;

      if (nextIceServers && nextIceServers.length > 0) {
        turnIceServersRef.current = nextIceServers;
        voiceRouteRef.current = "turn";
        iceServersRef.current = nextIceServers;

        callWarn("[call] TURN fallback activated", {
          count: nextIceServers.length,
          urls: nextIceServers.map((s: any) => s.urls),
        });

        return true;
      }

      callWarn("[call] TURN response has no ice_servers", data);
      return false;
    } catch (e) {
      callWarn("[call] TURN load failed", e);
      return false;
    } finally {
      loadingTurnRef.current = false;
    }
  }, [turnFallbackEnabled]);

  return {
    iceServersRef,
    voiceRouteRef,
    enableTurnFallback,
  };
}