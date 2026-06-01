"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SignalPayload, SignalRow, SignalType } from "./useCallSignaling";

type Member = {
  device_id: string;
  display_name: string;
  photo_path?: string | null;
  screen?: string;
  last_seen_at?: string | null;
  is_in_call?: boolean;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";
type VoiceRoute = "stun" | "turn";
type OsType = "windows" | "mac" | "ios" | "android" | "unknown";

type RemoteAudioState = {
  stream: MediaStream;
  member?: Member;
};

type UsePeerConnectionsArgs = {
  sessionId: string;
  deviceId: string;
  members: Member[];
  membersSyncRevision?: number;
  isMuted: boolean;
  micReady: boolean;
  signalReady: boolean;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  localAudioTrackRef: React.MutableRefObject<MediaStreamTrack | null>;
  sendSignal: (
    toDeviceId: string | null,
    signalType: SignalType,
    payload: SignalPayload
  ) => Promise<void>;
  onRemoteCountChange?: (count: number) => void;
  onStatusChange?: (text: string) => void;
  onPeerStatesChange?: (states: Record<string, PeerState>) => void;
};

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

function makeConnectionId(localId: string, remoteId: string) {
  return `${localId}__${remoteId}__${Date.now()}__${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function detectOs(): OsType {
  const ua =
    typeof navigator !== "undefined"
      ? navigator.userAgent.toLowerCase()
      : "";

  if (ua.includes("windows")) return "windows";
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  if (ua.includes("android")) return "android";
  if (ua.includes("mac")) return "mac";

  return "unknown";
}

async function detectConnectionType(pc: RTCPeerConnection) {
  const stats = await pc.getStats();

  let route: "turn" | "p2p" | "unknown" = "unknown";
  let localType: string | null = null;
  let remoteType: string | null = null;

  stats.forEach((report) => {
    if (report.type === "candidate-pair" && report.state === "succeeded") {
      const local = stats.get(report.localCandidateId);
      const remote = stats.get(report.remoteCandidateId);

      localType = local?.candidateType ?? null;
      remoteType = remote?.candidateType ?? null;

      if (localType === "relay" || remoteType === "relay") {
        route = "turn";
      } else if (localType || remoteType) {
        route = "p2p";
      }
    }
  });

  return { route, localType, remoteType };
}

export function usePeerConnections({
  sessionId,
  deviceId,
  members,
  membersSyncRevision = 0,
  isMuted,
  micReady,
  signalReady,
  localStreamRef,
  localAudioTrackRef,
  sendSignal,
  onRemoteCountChange,
  onStatusChange,
  onPeerStatesChange,
}: UsePeerConnectionsArgs) {
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const processedSignalIdsRef = useRef<Set<number>>(new Set());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const peerStatesRef = useRef<Map<string, PeerState>>(new Map());

  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const connectionIdsRef = useRef<Map<string, string>>(new Map());
  const offeredPeersRef = useRef<Set<string>>(new Set());
  const startedPeersRef = useRef<Set<string>>(new Set());

  const maybeStartOfferRef = useRef<((remoteId: string) => Promise<void>) | null>(
    null
  );

  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);
  const voiceRouteRef = useRef<VoiceRoute>("stun");
  const turnIceServersRef = useRef<RTCIceServer[] | null>(null);
  const loadingTurnRef = useRef(false);

  const osRef = useRef<OsType>(detectOs());
  const connectStartedAtRef = useRef<Map<string, number>>(new Map());
  const loggedConnectedRef = useRef<Set<string>>(new Set());
  const healRunSeqRef = useRef(0);
  const peerHealActionRef = useRef<
    Map<string, { lastAction: string; consecutive: number }>
  >(new Map());

  const [remoteAudios, setRemoteAudios] = useState<
    Record<string, RemoteAudioState>
  >({});
  const [turnFallbackEnabled, setTurnFallbackEnabled] = useState(false);
  const turnFallbackEnabledRef = useRef(false);

  const notifyStatus = useCallback(
    (text: string) => {
      onStatusChange?.(text);
    },
    [onStatusChange]
  );

  const activeMembers = useMemo(() => {
    return members;
  }, [members]);

  const getRemoteIds = useCallback(() => {
    const selfId = String(deviceId ?? "").trim();
    return activeMembers
      .map((m) => String(m.device_id ?? "").trim())
      .filter((id) => id && id !== selfId);
  }, [activeMembers, deviceId]);

  const emitPeerStates = useCallback(() => {
    onPeerStatesChange?.(Object.fromEntries(peerStatesRef.current.entries()));
  }, [onPeerStatesChange]);

  const setPeerState = useCallback(
    (remoteId: string, state: PeerState) => {
      peerStatesRef.current.set(remoteId, state);
      emitPeerStates();
    },
    [emitPeerStates]
  );

  const clearReconnectTimer = useCallback((remoteId: string) => {
    const timer = reconnectTimersRef.current.get(remoteId);
    if (timer) {
      window.clearTimeout(timer);
      reconnectTimersRef.current.delete(remoteId);
    }
  }, []);

  const getCurrentConnectionId = useCallback((remoteId: string) => {
    return connectionIdsRef.current.get(remoteId) ?? null;
  }, []);

  const setCurrentConnectionId = useCallback(
    (remoteId: string, connectionId: string) => {
      connectionIdsRef.current.set(remoteId, connectionId);
    },
    []
  );

  const clearCurrentConnectionId = useCallback((remoteId: string) => {
    connectionIdsRef.current.delete(remoteId);
  }, []);

  const markConnectStart = useCallback((remoteId: string) => {
    if (!connectStartedAtRef.current.has(remoteId)) {
      connectStartedAtRef.current.set(remoteId, Date.now());
    }
  }, []);

  const logVoiceConnection = useCallback(
    async (
      remoteId: string,
      pc: RTCPeerConnection,
      phase: "connected" | "failed" = "connected"
    ) => {
      const connectionId = getCurrentConnectionId(remoteId);
      const logKey = `${remoteId}:${connectionId ?? "none"}:${phase}`;

      if (phase === "connected" && loggedConnectedRef.current.has(logKey)) {
        return;
      }

      try {
        const result =
          phase === "connected"
            ? await detectConnectionType(pc)
            : { route: "unknown", localType: null, remoteType: null };

        const startedAt = connectStartedAtRef.current.get(remoteId);
        const timeToConnectMs = startedAt ? Date.now() - startedAt : null;

        await fetch("/api/voice-connection-log", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            deviceId,
            remoteDeviceId: remoteId,
            phase,
            route: result.route,
            localCandidateType: result.localType,
            remoteCandidateType: result.remoteType,
            voiceRoute: voiceRouteRef.current,
            connectionState:
              phase === "connected" ? pc.connectionState : "failed",
            timeToConnectMs,
            os: osRef.current,
            memberCount: members.length,
          }),
        });

        if (phase === "connected") {
          loggedConnectedRef.current.add(logKey);
        }
      } catch (e) {
        console.warn("[call] voice log failed", e);
      }
    },
    [deviceId, getCurrentConnectionId, members.length, sessionId]
  );

  const upsertRemoteAudio = useCallback(
    (remoteId: string, stream: MediaStream) => {
      remoteStreamsRef.current.set(remoteId, stream);

      setRemoteAudios((prev) => {
        const prevState = prev[remoteId];
        const member = members.find((m) => m.device_id === remoteId);

        if (prevState?.stream === stream) {
          return {
            ...prev,
            [remoteId]: {
              ...prevState,
              member,
            },
          };
        }

        return {
          ...prev,
          [remoteId]: {
            stream,
            member,
          },
        };
      });
    },
    [members]
  );

  useEffect(() => {
    setRemoteAudios((prev) => {
      const next: Record<string, RemoteAudioState> = {};

      for (const [remoteId, state] of Object.entries(prev)) {
        const member = members.find((m) => m.device_id === remoteId);
        next[remoteId] = { ...state, member };
      }

      return next;
    });
  }, [members]);

  useEffect(() => {
    onRemoteCountChange?.(Object.keys(remoteAudios).length);
  }, [remoteAudios, onRemoteCountChange]);

  const closePeer = useCallback(
    (remoteId: string, opts?: { clearConnectionId?: boolean }) => {
      const shouldClearConnectionId = opts?.clearConnectionId ?? false;
      const pc = pcsRef.current.get(remoteId);

      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.oniceconnectionstatechange = null;
          pc.onsignalingstatechange = null;
          pc.close();
        } catch {}
      }

      pcsRef.current.delete(remoteId);
      offeredPeersRef.current.delete(remoteId);
      startedPeersRef.current.delete(remoteId);
      remoteStreamsRef.current.delete(remoteId);
      pendingIceRef.current.delete(remoteId);
      clearReconnectTimer(remoteId);

      connectStartedAtRef.current.delete(remoteId);

      peerStatesRef.current.delete(remoteId);
      emitPeerStates();

      if (shouldClearConnectionId) {
        clearCurrentConnectionId(remoteId);
      }

      setRemoteAudios((prev) => {
        const next = { ...prev };
        delete next[remoteId];
        return next;
      });
    },
    [clearReconnectTimer, clearCurrentConnectionId, emitPeerStates]
  );

  const flushPendingIce = useCallback(
    async (remoteId: string, connectionId: string) => {
      const pc = pcsRef.current.get(remoteId);
      if (!pc || !pc.remoteDescription) return;

      const current = getCurrentConnectionId(remoteId);
      if (!current || current !== connectionId) return;

      const queued = pendingIceRef.current.get(remoteId) ?? [];
      if (!queued.length) return;

      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("[call] flush ice ignored", remoteId, e);
        }
      }

      pendingIceRef.current.delete(remoteId);
    },
    [getCurrentConnectionId]
  );

  const scheduleReconnect = useCallback(
    (remoteId: string, delay = 4000) => {
      if (!localAudioTrackRef.current && !localStreamRef.current) return;

      clearReconnectTimer(remoteId);

      const timer = window.setTimeout(() => {
        reconnectTimersRef.current.delete(remoteId);

        const nextConnectionId = makeConnectionId(deviceId, remoteId);
        closePeer(remoteId, { clearConnectionId: false });
        setCurrentConnectionId(remoteId, nextConnectionId);
        connectStartedAtRef.current.set(remoteId, Date.now());

        void maybeStartOfferRef.current?.(remoteId);
      }, delay);

      reconnectTimersRef.current.set(remoteId, timer);
    },
    [
      clearReconnectTimer,
      closePeer,
      deviceId,
      localAudioTrackRef,
      localStreamRef,
      setCurrentConnectionId,
    ]
  );

  useEffect(() => {
    turnFallbackEnabledRef.current = turnFallbackEnabled;
  }, [turnFallbackEnabled]);

  const enableTurnFallback = useCallback(async () => {
    if (!turnFallbackEnabledRef.current) return false;
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
        return true;
      }

      console.warn("[call] TURN response has no ice_servers", data);
      return false;
    } catch (e) {
      console.warn("[call] TURN load failed", e);
      return false;
    } finally {
      loadingTurnRef.current = false;
    }
  }, []);

  const createPeerConnection = useCallback(
    (remoteId: string, connectionId: string) => {
      const existing = pcsRef.current.get(remoteId);
      const currentId = getCurrentConnectionId(remoteId);

      if (existing && currentId === connectionId) {
        return existing;
      }

      if (existing && currentId !== connectionId) {
        closePeer(remoteId, { clearConnectionId: false });
      }

      setCurrentConnectionId(remoteId, connectionId);
      markConnectStart(remoteId);

      const currentIceServers =
        iceServersRef.current.length > 0
          ? iceServersRef.current
          : FALLBACK_ICE_SERVERS;

      const pc = new RTCPeerConnection({
        iceServers: currentIceServers,
        iceTransportPolicy: voiceRouteRef.current === "turn" ? "relay" : "all",
      });

      const localTrack = localAudioTrackRef.current;
      const localStream = localStreamRef.current;

      if (localTrack && localStream) {
        pc.addTrack(localTrack, localStream);

        const sender = pc
          .getSenders()
          .find((s) => s.track?.kind === "audio" || s.track === null);

        if (sender && isMuted) {
          void sender.replaceTrack(null);
        }
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        void sendSignal(remoteId, "ice", {
          connectionId,
          candidate: event.candidate.toJSON
            ? event.candidate.toJSON()
            : event.candidate,
        });
      };

      pc.ontrack = (event) => {
        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        const stream = event.streams?.[0];
        if (!stream) return;

        upsertRemoteAudio(remoteId, stream);

        window.setTimeout(() => {
          const audioEl = document.querySelector(
            `audio[data-remote="${remoteId}"]`
          ) as HTMLAudioElement | null;

          if (audioEl) {
            audioEl.muted = false;
            audioEl.defaultMuted = false;
            audioEl.volume = 1;
            audioEl.play().catch((e) => {
              console.warn(
                "[call] delayed remote audio play failed",
                remoteId,
                e
              );
            });
          }
        }, 300);
      };

      pc.oniceconnectionstatechange = () => {
        notifyStatus(`ice ${remoteId}: ${pc.iceConnectionState}`);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        if (pc.iceConnectionState === "failed") {
          setPeerState(remoteId, "failed");
          void logVoiceConnection(remoteId, pc, "failed");

          if (
            voiceRouteRef.current === "stun" &&
            turnFallbackEnabledRef.current
          ) {
            void enableTurnFallback().then((ok) => {
              if (!ok) {
                scheduleReconnect(remoteId, 1500);
                return;
              }

              const nextConnectionId = makeConnectionId(deviceId, remoteId);
              closePeer(remoteId, { clearConnectionId: false });
              setCurrentConnectionId(remoteId, nextConnectionId);
              connectStartedAtRef.current.set(remoteId, Date.now());
              scheduleReconnect(remoteId, 300);
            });

            return;
          }

          scheduleReconnect(remoteId, 1500);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;

        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed" ||
          state === "connected"
        ) {
          notifyStatus(`peer ${remoteId}: ${state}`);
        }

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        if (state === "connecting") {
          setPeerState(remoteId, "connecting");

          if (
            voiceRouteRef.current === "stun" &&
            turnFallbackEnabledRef.current
          ) {
            window.setTimeout(() => {
              const currentPc = pcsRef.current.get(remoteId);
              if (!currentPc) return;
              if (!turnFallbackEnabledRef.current) return;

              const stillBad =
                currentPc.connectionState === "connecting" ||
                currentPc.iceConnectionState === "checking" ||
                currentPc.iceConnectionState === "disconnected";

              if (!stillBad) return;

              void enableTurnFallback().then((ok) => {
                if (!ok) return;

                const nextConnectionId = makeConnectionId(deviceId, remoteId);
                closePeer(remoteId, { clearConnectionId: false });
                setCurrentConnectionId(remoteId, nextConnectionId);
                connectStartedAtRef.current.set(remoteId, Date.now());
                scheduleReconnect(remoteId, 300);
              });
            }, 5000);
          }
        }

        if (state === "connected") {
          setPeerState(remoteId, "connected");
          clearReconnectTimer(remoteId);

          const sender = pc
            .getSenders()
            .find((s) => s.track?.kind === "audio" || s.track === null);

          const track = localAudioTrackRef.current;

          if (sender && track) {
            void sender.replaceTrack(isMuted ? null : track);
          }

          window.setTimeout(() => {
            void logVoiceConnection(remoteId, pc, "connected");
          }, 1000);
        }

        if (state === "disconnected") {
          setPeerState(remoteId, "connecting");
        }

        if (state === "failed") {
          setPeerState(remoteId, "failed");
          void logVoiceConnection(remoteId, pc, "failed");

          if (
            voiceRouteRef.current === "stun" &&
            turnFallbackEnabledRef.current
          ) {
            void enableTurnFallback().then((ok) => {
              if (!ok) {
                closePeer(remoteId, { clearConnectionId: false });
                scheduleReconnect(remoteId, 1500);
                return;
              }

              const nextConnectionId = makeConnectionId(deviceId, remoteId);
              closePeer(remoteId, { clearConnectionId: false });
              setCurrentConnectionId(remoteId, nextConnectionId);
              connectStartedAtRef.current.set(remoteId, Date.now());
              scheduleReconnect(remoteId, 300);
            });

            return;
          }

          closePeer(remoteId, { clearConnectionId: false });
          scheduleReconnect(remoteId, 1500);
        }

        if (state === "closed") {
          setPeerState(remoteId, "idle");
        }
      };

      pcsRef.current.set(remoteId, pc);
      return pc;
    },
    [
      clearReconnectTimer,
      closePeer,
      deviceId,
      enableTurnFallback,
      getCurrentConnectionId,
      isMuted,
      localAudioTrackRef,
      localStreamRef,
      logVoiceConnection,
      markConnectStart,
      notifyStatus,
      scheduleReconnect,
      sendSignal,
      setCurrentConnectionId,
      setPeerState,
      upsertRemoteAudio,
    ]
  );

  const maybeStartOffer = useCallback(
    async (remoteId: string) => {
      const isOfferOwner = deviceId < remoteId;
      if (!isOfferOwner) return;

      if (!localAudioTrackRef.current && !localStreamRef.current) return;

      const hasRemoteStream = remoteStreamsRef.current.has(remoteId);
      const existingPc = pcsRef.current.get(remoteId);

      if (hasRemoteStream) return;

      if (
        existingPc &&
        (existingPc.connectionState === "connected" ||
          existingPc.signalingState === "have-local-offer" ||
          existingPc.signalingState === "have-remote-offer" ||
          existingPc.signalingState !== "stable")
      ) {
        return;
      }

      const connectionId =
        getCurrentConnectionId(remoteId) ?? makeConnectionId(deviceId, remoteId);

      if (!getCurrentConnectionId(remoteId)) {
        setCurrentConnectionId(remoteId, connectionId);
      }

      markConnectStart(remoteId);

      const pc = createPeerConnection(remoteId, connectionId);

      if (offeredPeersRef.current.has(remoteId)) return;
      if (pc.signalingState !== "stable") return;

      offeredPeersRef.current.add(remoteId);
      clearReconnectTimer(remoteId);
      setPeerState(remoteId, "connecting");

      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });

        const activeConnectionId = getCurrentConnectionId(remoteId);

        if (!activeConnectionId || activeConnectionId !== connectionId) {
          offeredPeersRef.current.delete(remoteId);
          return;
        }

        if (pc.signalingState !== "stable") {
          offeredPeersRef.current.delete(remoteId);
          return;
        }

        await pc.setLocalDescription(offer);

        await sendSignal(remoteId, "offer", {
          connectionId,
          sdp: pc.localDescription,
        });
      } catch (e) {
        offeredPeersRef.current.delete(remoteId);
        console.error("[call] create offer error", remoteId, connectionId, e);
      }
    },
    [
      clearReconnectTimer,
      createPeerConnection,
      deviceId,
      getCurrentConnectionId,
      localAudioTrackRef,
      localStreamRef,
      markConnectStart,
      sendSignal,
      setCurrentConnectionId,
      setPeerState,
    ]
  );

  useEffect(() => {
    maybeStartOfferRef.current = maybeStartOffer;
  }, [maybeStartOffer]);

  const logHealPeerAction = useCallback(
    (
      remoteId: string,
      action:
        | "create"
        | "reconnect"
        | "close-extra"
        | "retry-offer"
        | "skip",
      pc: RTCPeerConnection | null | undefined,
      opts?: {
        hasRemoteStream?: boolean;
        healRun?: number;
        scheduledInMs?: number;
      }
    ) => {
      const prev = peerHealActionRef.current.get(remoteId);
      const consecutive =
        prev?.lastAction === action ? prev.consecutive + 1 : 1;

      peerHealActionRef.current.set(remoteId, { lastAction: action, consecutive });

      const hasRemoteStream =
        opts?.hasRemoteStream ?? remoteStreamsRef.current.has(remoteId);
      const remoteStream = remoteStreamsRef.current.get(remoteId);
      const remoteTracksCount = remoteStream?.getAudioTracks().length ?? 0;

      const payload = {
        healRun: opts?.healRun ?? healRunSeqRef.current,
        deviceId,
        remoteDeviceId: remoteId,
        action,
        consecutive,
        repeatWarning:
          consecutive >= 3 &&
          (action === "reconnect" || action === "retry-offer"),
        signalingState: pc?.signalingState ?? null,
        connectionState: pc?.connectionState ?? null,
        iceConnectionState: pc?.iceConnectionState ?? null,
        hasRemoteStream,
        remoteTracksCount,
        ...(opts?.scheduledInMs != null
          ? { scheduledInMs: opts.scheduledInMs }
          : {}),
      };

      if (payload.repeatWarning) {
        console.warn("[voice-peer] healPeerConnections", payload);
      } else {
        console.log("[voice-peer] healPeerConnections", payload);
      }
    },
    [deviceId]
  );

  const healPeerConnections = useCallback(() => {
    if (!micReady || !signalReady) return;

    healRunSeqRef.current += 1;
    const healRun = healRunSeqRef.current;

    const remoteIds = getRemoteIds();

    for (const existingId of Array.from(pcsRef.current.keys())) {
      if (!remoteIds.includes(existingId)) {
        logHealPeerAction(
          existingId,
          "close-extra",
          pcsRef.current.get(existingId),
          { healRun }
        );
        closePeer(existingId, { clearConnectionId: true });
      }
    }

    for (const remoteId of remoteIds) {
      const pc = pcsRef.current.get(remoteId);
      const hasStream = remoteStreamsRef.current.has(remoteId);
      const connected = pc?.connectionState === "connected";

      if (hasStream && connected) {
        setPeerState(remoteId, "connected");
        logHealPeerAction(remoteId, "skip", pc, {
          healRun,
          hasRemoteStream: true,
        });
        continue;
      }

      const failed =
        !pc ||
        pc.connectionState === "failed" ||
        pc.iceConnectionState === "failed" ||
        pc.connectionState === "closed";

      if (failed) {
        logHealPeerAction(remoteId, pc ? "reconnect" : "create", pc, {
          healRun,
          hasRemoteStream: hasStream,
        });

        offeredPeersRef.current.delete(remoteId);
        startedPeersRef.current.delete(remoteId);
        if (pc) {
          closePeer(remoteId, { clearConnectionId: false });
        }
        if (!getCurrentConnectionId(remoteId)) {
          setCurrentConnectionId(remoteId, makeConnectionId(deviceId, remoteId));
        }
        connectStartedAtRef.current.set(remoteId, Date.now());
        void maybeStartOffer(remoteId);
        continue;
      }

      const stuckOffer =
        offeredPeersRef.current.has(remoteId) &&
        !hasStream &&
        pc.signalingState === "have-local-offer";

      if (stuckOffer) {
        const startedAt = connectStartedAtRef.current.get(remoteId) ?? Date.now();
        if (Date.now() - startedAt > 6000) {
          logHealPeerAction(remoteId, "retry-offer", pc, {
            healRun,
            hasRemoteStream: hasStream,
            scheduledInMs: 300,
          });
          offeredPeersRef.current.delete(remoteId);
          closePeer(remoteId, { clearConnectionId: false });
          scheduleReconnect(remoteId, 300);
        } else {
          logHealPeerAction(remoteId, "skip", pc, {
            healRun,
            hasRemoteStream: hasStream,
          });
        }
        continue;
      }

      if (!hasStream && !offeredPeersRef.current.has(remoteId)) {
        logHealPeerAction(remoteId, pc ? "retry-offer" : "create", pc, {
          healRun,
          hasRemoteStream: hasStream,
        });

        if (!getCurrentConnectionId(remoteId)) {
          setCurrentConnectionId(remoteId, makeConnectionId(deviceId, remoteId));
        }
        markConnectStart(remoteId);
        void maybeStartOffer(remoteId);
        continue;
      }

      logHealPeerAction(remoteId, "skip", pc, {
        healRun,
        hasRemoteStream: hasStream,
      });
    }

    emitPeerStates();

    console.log("[voice-peer] healPeerConnections done", {
      healRun,
      deviceId,
      remoteDeviceIds: remoteIds,
      peerConnectionCount: pcsRef.current.size,
    });
  }, [
    closePeer,
    deviceId,
    emitPeerStates,
    getCurrentConnectionId,
    getRemoteIds,
    logHealPeerAction,
    markConnectStart,
    maybeStartOffer,
    micReady,
    scheduleReconnect,
    setCurrentConnectionId,
    setPeerState,
    signalReady,
  ]);

  const handleSignal = useCallback(
    async (row: SignalRow) => {
      if (!row || processedSignalIdsRef.current.has(row.id)) return;
      processedSignalIdsRef.current.add(row.id);

      if (row.from_device_id === deviceId) return;
      if (row.to_device_id && row.to_device_id !== deviceId) return;
      if (row.session_id !== sessionId) return;

      const remoteId = row.from_device_id;
      const payload = row.payload ?? {};
      const incomingConnectionId = payload.connectionId;

      if (row.signal_type === "leave") {
        closePeer(remoteId, { clearConnectionId: true });
        return;
      }

      if (!incomingConnectionId) return;

      let currentConnectionId = getCurrentConnectionId(remoteId);

      if (row.signal_type === "offer") {
        if (currentConnectionId !== incomingConnectionId) {
          closePeer(remoteId, { clearConnectionId: false });
          setCurrentConnectionId(remoteId, incomingConnectionId);
          connectStartedAtRef.current.set(remoteId, Date.now());
          currentConnectionId = incomingConnectionId;
          offeredPeersRef.current.delete(remoteId);
          startedPeersRef.current.add(remoteId);
        }
      } else if (
        !currentConnectionId ||
        currentConnectionId !== incomingConnectionId
      ) {
        return;
      }

      const pc = createPeerConnection(remoteId, incomingConnectionId);

      try {
        if (row.signal_type === "offer") {
          const sdp = payload.sdp;
          if (!sdp) return;
          if (pc.signalingState !== "stable") return;

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(remoteId, incomingConnectionId);

          setPeerState(remoteId, "connecting");

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await sendSignal(remoteId, "answer", {
            connectionId: incomingConnectionId,
            sdp: pc.localDescription,
          });

          return;
        }

        if (row.signal_type === "answer") {
          const sdp = payload.sdp;
          if (!sdp) return;
          if (pc.signalingState !== "have-local-offer") return;

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(remoteId, incomingConnectionId);
          return;
        }

        if (row.signal_type === "ice") {
          const candidate = payload.candidate;
          if (!candidate) return;

          if (!pc.remoteDescription) {
            const queued = pendingIceRef.current.get(remoteId) ?? [];
            queued.push(candidate);
            pendingIceRef.current.set(remoteId, queued);
            return;
          }

          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn("[call] addIceCandidate ignored", remoteId, e);
          }
        }
      } catch (e) {
        console.error("[call] signal handle error", row.signal_type, remoteId, e);

        if (row.signal_type === "offer" || row.signal_type === "answer") {
          closePeer(remoteId, { clearConnectionId: false });
          scheduleReconnect(remoteId, 1500);
        }
      }
    },
    [
      closePeer,
      createPeerConnection,
      deviceId,
      flushPendingIce,
      getCurrentConnectionId,
      scheduleReconnect,
      sendSignal,
      sessionId,
      setCurrentConnectionId,
      setPeerState,
    ]
  );

  useEffect(() => {
    let alive = true;

    async function loadVoiceSettings() {
      try {
        const res = await fetch("/api/voice-settings", {
          cache: "no-store",
        });

        const data = await res.json();

        if (!alive) return;

        const settings = data?.settings;

        if (settings) {
          setTurnFallbackEnabled(settings.turn_fallback_enabled === true);

          if (settings.voice_enabled === false) {
            notifyStatus(settings.emergency_message || "通話機能は停止中です");
          }
        } else {
          setTurnFallbackEnabled(false);
        }
      } catch {
        setTurnFallbackEnabled(false);
      }
    }

    void loadVoiceSettings();

    return () => {
      alive = false;
    };
  }, [notifyStatus]);

  useEffect(() => {
    const track = localAudioTrackRef.current;
    if (!track) return;

    track.enabled = true;

    for (const pc of pcsRef.current.values()) {
      const sender = pc
        .getSenders()
        .find((s) => s.track?.kind === "audio" || s.track === null);

      if (sender) {
        void sender.replaceTrack(isMuted ? null : track);
      }
    }
  }, [isMuted, localAudioTrackRef]);

  useEffect(() => {
    const remoteIds = getRemoteIds();

    console.log("[voice-peer] offer effect check", {
      micReady,
      signalReady,
      remoteIds,
      membersCount: members.length,
      os: osRef.current,
      voiceRoute: voiceRouteRef.current,
      members: members.map((m) => ({
        device_id: m.device_id,
        is_in_call: m.is_in_call,
      })),
    });

    if (!micReady) {
      console.log("[voice-peer] stop: micReady false");
      return;
    }

    if (!signalReady) {
      console.log("[voice-peer] stop: signalReady false");
      return;
    }

    if (remoteIds.length < 1) {
      console.log("[voice-peer] stop: no remoteIds");
      return;
    }

    for (const existingId of Array.from(pcsRef.current.keys())) {
      if (!remoteIds.includes(existingId)) {
        startedPeersRef.current.delete(existingId);
        peerStatesRef.current.delete(existingId);
        emitPeerStates();
        closePeer(existingId, { clearConnectionId: true });
      }
    }

    for (const remoteId of remoteIds) {
      if (!getCurrentConnectionId(remoteId)) {
        setCurrentConnectionId(remoteId, makeConnectionId(deviceId, remoteId));
      }

      void maybeStartOffer(remoteId);
    }

    healPeerConnections();
  }, [
    members,
    micReady,
    signalReady,
    deviceId,
    closePeer,
    emitPeerStates,
    getCurrentConnectionId,
    getRemoteIds,
    healPeerConnections,
    maybeStartOffer,
    setCurrentConnectionId,
  ]);

  useEffect(() => {
    if (!micReady) return;
    if (!signalReady) return;

    const timer = window.setInterval(() => {
      healPeerConnections();
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [micReady, signalReady, healPeerConnections]);

  useEffect(() => {
    if (membersSyncRevision <= 0) return;
    healPeerConnections();
  }, [membersSyncRevision, healPeerConnections]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        healPeerConnections();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [healPeerConnections]);

  useEffect(() => {
    if (!micReady) return;
    if (!signalReady && !pcsRef.current.size) return;

    const timer = window.setInterval(() => {
      const remoteIds = getRemoteIds();

      for (const remoteId of remoteIds) {
        const hasRemoteStream = remoteStreamsRef.current.has(remoteId);
        const pc = pcsRef.current.get(remoteId);

        if (hasRemoteStream) continue;
        if (!pc) continue;

        const badState =
          pc.connectionState === "failed" || pc.iceConnectionState === "failed";

        if (badState) {
          scheduleReconnect(remoteId, 1500);
        }
      }
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [members, micReady, signalReady, deviceId, scheduleReconnect, getRemoteIds]);

  return {
    remoteAudios,
    handleSignal,
  };
}