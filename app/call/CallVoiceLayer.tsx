"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const DEBUG_CALL = false;

function callLog(...args: any[]) {
  if (DEBUG_CALL) console.log(...args);
}

function callWarn(...args: any[]) {
  if (DEBUG_CALL) console.warn(...args);
}

function callError(...args: any[]) {
  if (DEBUG_CALL) console.error(...args);
}

type Member = {
  device_id: string;
  display_name: string;
  photo_path?: string | null;
  screen?: string;
  last_seen_at?: string | null;
  is_in_call?: boolean;
};

type SignalType = "offer" | "answer" | "ice" | "leave";

type SignalPayload = {
  connectionId?: string;
  sdp?: RTCSessionDescriptionInit | null;
  candidate?: RTCIceCandidateInit | null;
};

type SignalRow = {
  id: number;
  session_id: string;
  from_device_id: string;
  to_device_id: string | null;
  signal_type: SignalType;
  payload: SignalPayload | null;
  created_at: string;
};

type RemoteAudioState = {
  stream: MediaStream;
  member?: Member;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";
type VoiceRoute = "stun" | "turn";

type CallVoiceLayerProps = {
  sessionId: string;
  deviceId: string;
  members: Member[];
  isMuted: boolean;
  onMicReadyChange?: (ready: boolean) => void;
  onMicLevelChange?: (level: number) => void;
  onRemoteSpeakingChange?: (remoteId: string, level: number) => void;
  onRemoteCountChange?: (count: number) => void;
  onStatusChange?: (text: string) => void;
  onPeerStatesChange?: (states: Record<string, PeerState>) => void;
};

function makeConnectionId(localId: string, remoteId: string) {
  return `${localId}__${remoteId}__${Date.now()}__${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export default function CallVoiceLayer({
  sessionId,
  deviceId,
  members,
  isMuted,
  onMicReadyChange,
  onMicLevelChange,
  onRemoteSpeakingChange,
  onRemoteCountChange,
  onStatusChange,
  onPeerStatesChange,
}: CallVoiceLayerProps) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const processedSignalIdsRef = useRef<Set<number>>(new Set());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const peerStatesRef = useRef<Map<string, PeerState>>(new Map());

  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const connectionIdsRef = useRef<Map<string, string>>(new Map());
  const offeredPeersRef = useRef<Set<string>>(new Set());
  const startedPeersRef = useRef<Set<string>>(new Set());

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handleSignalRef = useRef<(row: SignalRow) => Promise<void> | void>(
    () => {}
  );

  const [micReady, setMicReady] = useState(false);
  const [micStreamVersion, setMicStreamVersion] = useState(0);
  const [signalReady, setSignalReady] = useState(false);
  const [remoteAudios, setRemoteAudios] = useState<
    Record<string, RemoteAudioState>
  >({});

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");

  const [iceServers, setIceServers] =
  useState<RTCIceServer[]>(FALLBACK_ICE_SERVERS);

const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);

const [voiceRoute, setVoiceRoute] = useState<VoiceRoute>("stun");
const voiceRouteRef = useRef<VoiceRoute>("stun");
const turnIceServersRef = useRef<RTCIceServer[] | null>(null);
const loadingTurnRef = useRef(false);

const [turnFallbackEnabled, setTurnFallbackEnabled] = useState(true);

const enableTurnFallback = useCallback(async () => {
  if (!turnFallbackEnabled) {
    callWarn("[call] TURN fallback disabled by admin setting");
    return false;
  }

  if (voiceRouteRef.current === "turn") return true;

  if (turnIceServersRef.current && turnIceServersRef.current.length > 0) {
    voiceRouteRef.current = "turn";
    setVoiceRoute("turn");
    iceServersRef.current = turnIceServersRef.current;
setIceServers(turnIceServersRef.current);
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
      setVoiceRoute("turn");
      iceServersRef.current = nextIceServers;
setIceServers(nextIceServers);

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

  const activeMembers = useMemo(() => {
    const hasInCallInfo = members.some((m) => typeof m.is_in_call === "boolean");

    if (!hasInCallInfo) return members;

    return members.filter(
      (m) => m.device_id === deviceId || m.is_in_call === true
    );
  }, [members, deviceId]);

  const getRemoteIds = useCallback(() => {
    return activeMembers
      .map((m) => String(m.device_id ?? "").trim())
      .filter((id) => id && id !== deviceId);
  }, [activeMembers, deviceId]);

  const notifyStatus = useCallback(
    (text: string) => {
      onStatusChange?.(text);
    },
    [onStatusChange]
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
        setTurnFallbackEnabled(settings.turn_fallback_enabled !== false);

        if (settings.voice_enabled === false) {
          notifyStatus(settings.emergency_message || "通話機能は停止中です");
        }
      }
    } catch {
      setTurnFallbackEnabled(true);
    }
  }

  void loadVoiceSettings();

  return () => {
    alive = false;
  };
}, [notifyStatus]);

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

  const sendSignal = useCallback(
    async (
      toDeviceId: string | null,
      signalType: SignalType,
      payload: SignalPayload
    ) => {
      if (!sessionId) return;

      const { error } = await supabase.from("call_signals").insert({
        session_id: sessionId,
        from_device_id: deviceId,
        to_device_id: toDeviceId,
        signal_type: signalType,
        payload,
      });

      if (error) {
        callError("[call] signal insert error", error);
        notifyStatus(`signal error: ${error.message}`);
      }
    },
    [sessionId, deviceId, notifyStatus]
  );

  const closePeer = useCallback(
    (remoteId: string, opts?: { clearConnectionId?: boolean }) => {
      const shouldClearConnectionId = opts?.clearConnectionId ?? false;

      callLog("[call] close peer", remoteId, {
        clearConnectionId: shouldClearConnectionId,
      });

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

      callLog("[call] flush pending ice", remoteId, connectionId, queued.length);

      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          callWarn("[call] flush ice ignored", remoteId, e);
        }
      }

      pendingIceRef.current.delete(remoteId);
    },
    [getCurrentConnectionId]
  );

  const maybeStartOfferRef = useRef<((remoteId: string) => Promise<void>) | null>(
    null
  );

  const scheduleReconnect = useCallback(
    (remoteId: string, delay = 4000) => {
      if (!localAudioTrackRef.current && !localStreamRef.current) return;

      callLog("[call] schedule reconnect", remoteId, { delay });

      clearReconnectTimer(remoteId);

      const timer = window.setTimeout(() => {
        reconnectTimersRef.current.delete(remoteId);

        const nextConnectionId = makeConnectionId(deviceId, remoteId);
        closePeer(remoteId, { clearConnectionId: false });
        setCurrentConnectionId(remoteId, nextConnectionId);

        callLog("[call] reconnect prepared", remoteId, nextConnectionId);

        void maybeStartOfferRef.current?.(remoteId);
      }, delay);

      reconnectTimersRef.current.set(remoteId, timer);
    },
    [clearReconnectTimer, closePeer, deviceId, setCurrentConnectionId]
  );

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

      const currentIceServers =
  iceServersRef.current.length > 0
    ? iceServersRef.current
    : FALLBACK_ICE_SERVERS;

const pc = new RTCPeerConnection({
  iceServers: currentIceServers,
  iceTransportPolicy: "all",
});

      callLog("[call] create peer", {
  remoteId,
  connectionId,
  voiceRoute: voiceRouteRef.current,
  iceServers: currentIceServers.map((s) => s.urls),
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

        callLog("[call] add local track", {
          remoteId,
          enabled: localTrack.enabled,
          readyState: localTrack.readyState,
          trackId: localTrack.id,
          muted: isMuted,
        });
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;

        callLog("[call] ICE candidate", {
          remoteId,
          candidate: event.candidate.candidate,
        });

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

        callLog("[call] ontrack", remoteId, connectionId, {
          trackCount: stream.getTracks().length,
          audioTracks: stream.getAudioTracks().map((t) => ({
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState,
            label: t.label,
          })),
        });

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
              callWarn("[call] delayed remote audio play failed", remoteId, e);
            });
          }
        }, 300);
      };

      pc.onsignalingstatechange = () => {
        callLog(
          "[call] signaling state",
          remoteId,
          connectionId,
          pc.signalingState
        );
      };

      pc.oniceconnectionstatechange = () => {
        callLog("[call] ice state", remoteId, connectionId, pc.iceConnectionState);
        notifyStatus(`ice ${remoteId}: ${pc.iceConnectionState}`);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        if (pc.iceConnectionState === "failed") {
  callWarn("[call] ICE failed", {
    remoteId,
    connectionId,
    voiceRoute: voiceRouteRef.current,
  });

  setPeerState(remoteId, "failed");

  if (voiceRouteRef.current === "stun") {
    void enableTurnFallback().then((ok) => {
      if (!ok) {
        scheduleReconnect(remoteId, 4000);
        return;
      }

      const nextConnectionId = makeConnectionId(deviceId, remoteId);
      closePeer(remoteId, { clearConnectionId: false });
      setCurrentConnectionId(remoteId, nextConnectionId);
      scheduleReconnect(remoteId, 300);
    });

    return;
  }

  scheduleReconnect(remoteId, 4000);
}
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;

        callLog("[call] connection state", remoteId, connectionId, state);

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
        }

        if (state === "connected") {
  setPeerState(remoteId, "connected");
  clearReconnectTimer(remoteId);

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

  // 🔥 追加：接続直後にトラックを強制再適用
  const sender = pc
    .getSenders()
    .find((s) => s.track?.kind === "audio" || s.track === null);

  const track = localAudioTrackRef.current;

  if (sender && track) {
    void sender.replaceTrack(isMuted ? null : track);
  }
}

        if (state === "disconnected") {
          callWarn("[call] peer disconnected, wait", remoteId);
          setPeerState(remoteId, "connecting");
        }

        if (state === "failed") {
  setPeerState(remoteId, "failed");

  if (voiceRouteRef.current === "stun") {
    void enableTurnFallback().then((ok) => {
      if (!ok) {
        closePeer(remoteId, { clearConnectionId: false });
        scheduleReconnect(remoteId, 4000);
        return;
      }

      const nextConnectionId = makeConnectionId(deviceId, remoteId);
      closePeer(remoteId, { clearConnectionId: false });
      setCurrentConnectionId(remoteId, nextConnectionId);
      scheduleReconnect(remoteId, 300);
    });

    return;
  }

  closePeer(remoteId, { clearConnectionId: false });
  scheduleReconnect(remoteId, 4000);
}

        if (state === "closed") {
          setPeerState(remoteId, "idle");
        }
      };

      pcsRef.current.set(remoteId, pc);
      return pc;
    },
    [
  closePeer,
  clearReconnectTimer,
  enableTurnFallback,
  getCurrentConnectionId,
  isMuted,
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
      const isOfferOwner = deviceId.localeCompare(remoteId) < 0;

      if (!isOfferOwner) {
        callLog("[call] skip offer: responder side", {
          deviceId,
          remoteId,
        });
        return;
      }

      if (!localAudioTrackRef.current && !localStreamRef.current) {
        callLog("[call] skip offer: local audio not ready", remoteId);
        return;
      }

      const hasRemoteStream = remoteStreamsRef.current.has(remoteId);
      const existingPc = pcsRef.current.get(remoteId);

      if (hasRemoteStream) return;

      if (
        existingPc &&
        (existingPc.connectionState === "connected" ||
          existingPc.connectionState === "connecting" ||
          existingPc.signalingState === "have-local-offer" ||
          existingPc.signalingState === "have-remote-offer" ||
          existingPc.signalingState !== "stable")
      ) {
        callLog("[call] skip offer: existing pc busy", remoteId, {
          connectionState: existingPc.connectionState,
          iceConnectionState: existingPc.iceConnectionState,
          signalingState: existingPc.signalingState,
        });
        return;
      }

      const connectionId =
        getCurrentConnectionId(remoteId) ?? makeConnectionId(deviceId, remoteId);

      if (!getCurrentConnectionId(remoteId)) {
        setCurrentConnectionId(remoteId, connectionId);
      }

      const pc = createPeerConnection(remoteId, connectionId);

      if (offeredPeersRef.current.has(remoteId)) {
        callLog("[call] skip offer: already offered", remoteId, connectionId);
        return;
      }

      if (pc.signalingState !== "stable") {
        callLog(
          "[call] skip offer: non-stable",
          remoteId,
          connectionId,
          pc.signalingState
        );
        return;
      }

      offeredPeersRef.current.add(remoteId);
      clearReconnectTimer(remoteId);
      setPeerState(remoteId, "connecting");

      try {
        callLog("[call] create offer start", remoteId, connectionId);

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
        });

        const activeConnectionId = getCurrentConnectionId(remoteId);

        if (!activeConnectionId || activeConnectionId !== connectionId) {
          offeredPeersRef.current.delete(remoteId);
          return;
        }

        if (pc.signalingState !== "stable") {
          callWarn(
            "[call] abort offer before setLocalDescription",
            remoteId,
            connectionId,
            pc.signalingState
          );
          offeredPeersRef.current.delete(remoteId);
          return;
        }

        await pc.setLocalDescription(offer);

        await sendSignal(remoteId, "offer", {
          connectionId,
          sdp: pc.localDescription,
        });

        callLog("[call] offer sent", remoteId, connectionId);
      } catch (e) {
        offeredPeersRef.current.delete(remoteId);
        callError("[call] create offer error", remoteId, connectionId, e);
      }
    },
    [
      clearReconnectTimer,
      createPeerConnection,
      deviceId,
      getCurrentConnectionId,
      sendSignal,
      setCurrentConnectionId,
      setPeerState,
    ]
  );

  useEffect(() => {
    maybeStartOfferRef.current = maybeStartOffer;
  }, [maybeStartOffer]);

  const handleSignal = useCallback(
    async (row: SignalRow) => {
      callLog("[call] signal received raw", {
        id: row.id,
        type: row.signal_type,
        from: row.from_device_id,
        to: row.to_device_id,
        me: deviceId,
        session: row.session_id,
      });

      if (!row || processedSignalIdsRef.current.has(row.id)) return;
      processedSignalIdsRef.current.add(row.id);

      if (row.from_device_id === deviceId) return;
      if (row.to_device_id && row.to_device_id !== deviceId) return;
      if (row.session_id !== sessionId) return;

      const remoteId = row.from_device_id;
      const payload = row.payload ?? {};
      const incomingConnectionId = payload.connectionId;

      if (row.signal_type === "leave") {
        callLog("[call] leave received", remoteId);
        closePeer(remoteId, { clearConnectionId: true });
        return;
      }

      if (!incomingConnectionId) {
        callWarn(
          "[call] ignore signal without connectionId",
          row.signal_type,
          remoteId
        );
        return;
      }

      let currentConnectionId = getCurrentConnectionId(remoteId);

      if (row.signal_type === "offer") {
        if (currentConnectionId !== incomingConnectionId) {
          callLog("[call] new offer connection id", remoteId, {
            currentConnectionId,
            incomingConnectionId,
          });
          closePeer(remoteId, { clearConnectionId: false });
          setCurrentConnectionId(remoteId, incomingConnectionId);
          currentConnectionId = incomingConnectionId;
          offeredPeersRef.current.delete(remoteId);
          startedPeersRef.current.add(remoteId);
        }
      } else if (
        !currentConnectionId ||
        currentConnectionId !== incomingConnectionId
      ) {
        callWarn("[call] ignore stale signal", row.signal_type, remoteId, {
          currentConnectionId,
          incomingConnectionId,
        });
        return;
      }

      const pc = createPeerConnection(remoteId, incomingConnectionId);

      try {
        if (row.signal_type === "offer") {
          const sdp = payload.sdp;
          if (!sdp) return;

          if (pc.signalingState !== "stable") {
            callWarn(
              "[call] ignore offer in non-stable state",
              remoteId,
              incomingConnectionId,
              pc.signalingState
            );
            return;
          }

          callLog("[call] applying offer", remoteId, incomingConnectionId);

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(remoteId, incomingConnectionId);

          setPeerState(remoteId, "connecting");

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await sendSignal(remoteId, "answer", {
            connectionId: incomingConnectionId,
            sdp: pc.localDescription,
          });

          callLog("[call] answer sent", remoteId, incomingConnectionId);
          return;
        }

        if (row.signal_type === "answer") {
          const sdp = payload.sdp;
          if (!sdp) return;

          if (pc.signalingState !== "have-local-offer") {
            callWarn(
              "[call] ignore answer in invalid state",
              remoteId,
              incomingConnectionId,
              pc.signalingState
            );
            return;
          }

          callLog("[call] applying answer", remoteId, incomingConnectionId);

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(remoteId, incomingConnectionId);

          callLog("[call] answer applied", remoteId, incomingConnectionId);
          return;
        }

        if (row.signal_type === "ice") {
          const candidate = payload.candidate;
          if (!candidate) return;

          if (!pc.remoteDescription) {
            const queued = pendingIceRef.current.get(remoteId) ?? [];
            queued.push(candidate);
            pendingIceRef.current.set(remoteId, queued);

            callLog(
              "[call] queue ice before remoteDescription",
              remoteId,
              incomingConnectionId,
              queued.length
            );

            return;
          }

          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            callWarn(
              "[call] addIceCandidate ignored",
              remoteId,
              incomingConnectionId,
              e
            );
          }

          return;
        }
      } catch (e) {
        callError(
          "[call] signal handle error",
          row.signal_type,
          remoteId,
          incomingConnectionId,
          e
        );

        if (row.signal_type === "offer" || row.signal_type === "answer") {
          closePeer(remoteId, { clearConnectionId: false });
          scheduleReconnect(remoteId, 4000);
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
    handleSignalRef.current = handleSignal;
  }, [handleSignal]);

  useEffect(() => {
    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");

        setAudioInputs(inputs);

        const nonVirtual = inputs.find((d) => {
          if (!d.label) return false;

          const label = d.label.toLowerCase();

          return (
            !label.includes("steam") &&
            !label.includes("virtual") &&
            !label.includes("obs") &&
            !label.includes("discord")
          );
        });

        if (nonVirtual) {
          setSelectedMicId(nonVirtual.deviceId);
        } else if (inputs[0]) {
          setSelectedMicId(inputs[0].deviceId);
        }
      } catch (e) {
        callWarn("[call] load audio devices failed", e);
      }
    }

    void loadDevices();
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
          localAudioTrackRef.current = null;
        }

        const deviceConstraint = selectedMicId
          ? { exact: selectedMicId }
          : undefined;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceConstraint,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        localAudioTrackRef.current = stream.getAudioTracks()[0] ?? null;

        setMicStreamVersion((v) => v + 1);

        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.enabled = true;

          for (const pc of pcsRef.current.values()) {
            const sender = pc
              .getSenders()
              .find((s) => s.track?.kind === "audio" || s.track === null);

            if (sender) {
              void sender.replaceTrack(
                isMuted ? null : localAudioTrackRef.current
              );
            }
          }
        }

        callLog("[call] local audio track", {
          deviceId,
          trackId: localAudioTrackRef.current?.id ?? null,
          label: localAudioTrackRef.current?.label ?? null,
          enabled: localAudioTrackRef.current?.enabled ?? null,
          muted: isMuted,
        });

        setMicReady(true);
        onMicReadyChange?.(true);
        notifyStatus("");
      } catch (e) {
        callError("[call] mic error", e);
        setMicReady(false);
        onMicReadyChange?.(false);
        notifyStatus("マイク取得に失敗");
      }
    };

    void init();

    return () => {
      mounted = false;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      localAudioTrackRef.current = null;
    };
  }, [selectedMicId, deviceId, notifyStatus, onMicReadyChange]);

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

    callLog("[call] mute changed", {
      muted: isMuted,
      enabled: track.enabled,
      readyState: track.readyState,
      trackId: track.id,
    });
  }, [isMuted]);

  useEffect(() => {
    if (!micReady) return;
    if (!localStreamRef.current) return;

    let raf = 0;
    let closed = false;
    let ctx: AudioContext | null = null;

    const run = async () => {
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;

        ctx = new Ctx();
        audioCtxRef.current = ctx;

        if (ctx.state === "suspended") {
          await ctx.resume().catch(() => {});
        }

        const source = ctx.createMediaStreamSource(
          localStreamRef.current as MediaStream
        );
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = async () => {
          if (closed) return;

          if (ctx?.state === "suspended") {
            await ctx.resume().catch(() => {});
          }

          analyser.getByteTimeDomainData(data);

          let sum = 0;

          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }

          const rms = Math.sqrt(sum / data.length);
          const level = Math.min(1, Math.max(0, (rms - 0.005) * 12));

          onMicLevelChange?.(level);
          raf = requestAnimationFrame(tick);
        };

        tick();
      } catch (e) {
        callError("[call] meter error", e);
      }
    };

    void run();

    return () => {
      closed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ctx) void ctx.close().catch(() => {});
      if (audioCtxRef.current === ctx) audioCtxRef.current = null;
    };
  }, [micReady, micStreamVersion, onMicLevelChange]);

  useEffect(() => {
    if (!sessionId || !deviceId) return;

    let alive = true;

    setSignalReady(false);

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
          await handleSignalRef.current(row);
        }
      )
      .subscribe((status) => {
        callLog("[call] signal subscribe status", status);

        if (!alive) return;

        if (status === "SUBSCRIBED") {
          setSignalReady(true);
          return;
        }

        if (
          status === "CLOSED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          callWarn("[call] signal channel dead", status);
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

  useEffect(() => {
    const remoteIds = getRemoteIds();

    callLog("[call] offer effect check", {
      micReady,
      signalReady,
      deviceId,
      members: members.map((m) => ({
        device_id: m.device_id,
        screen: m.screen,
        is_in_call: m.is_in_call,
      })),
      remoteIds,
    });

    if (!micReady) return;
    if (!signalReady) return;
    if (remoteIds.length < 1) return;

    callLog("[call] remoteIds for offer", { remoteIds });

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

      callLog("[call] try maybeStartOffer", { remoteId, deviceId });
      void maybeStartOffer(remoteId);
    }
  }, [
    members,
    micReady,
    signalReady,
    deviceId,
    closePeer,
    emitPeerStates,
    getCurrentConnectionId,
    getRemoteIds,
    maybeStartOffer,
    setCurrentConnectionId,
  ]);

  useEffect(() => {
    if (!micReady) return;
    if (!signalReady) return;

    const timer = window.setInterval(() => {
      const remoteIds = getRemoteIds();

      for (const remoteId of remoteIds) {
        const hasRemoteStream = remoteStreamsRef.current.has(remoteId);
        const pc = pcsRef.current.get(remoteId);

        if (hasRemoteStream) continue;
        if (pc && pc.connectionState === "connected") continue;
        if (pc && pc.signalingState !== "stable") continue;
        if (pc && pc.connectionState === "connecting") continue;

        void maybeStartOffer(remoteId);
      }
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [members, micReady, signalReady, deviceId, maybeStartOffer, getRemoteIds]);

  useEffect(() => {
    if (!micReady) return;
    if (!signalReady) return;

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
          callWarn("[call] watchdog reconnect", remoteId, {
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
          });

          scheduleReconnect(remoteId, 4000);
        }
      }
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [members, micReady, signalReady, deviceId, scheduleReconnect, getRemoteIds]);

  return (
    <>
      {audioInputs.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <select
            value={selectedMicId}
            onChange={(e) => setSelectedMicId(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            {audioInputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || "マイク"}
              </option>
            ))}
          </select>
        </div>
      )}

      {Object.entries(remoteAudios).map(([remoteId, state]) => (
        <RemoteAudio
          key={remoteId}
          stream={state.stream}
          remoteId={remoteId}
          onSpeaking={onRemoteSpeakingChange}
        />
      ))}
    </>
  );
}

function RemoteAudio({
  stream,
  remoteId,
  onSpeaking,
}: {
  stream: MediaStream;
  remoteId: string;
  onSpeaking?: (remoteId: string, level: number) => void;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const lastStreamRef = useRef<MediaStream | null>(null);
  const [blocked, setBlocked] = useState(false);

  const playAudio = useCallback(async () => {
    const el = ref.current;
    if (!el) return;

    try {
      el.muted = false;
      el.defaultMuted = false;
      el.volume = 1;

      await el.play();
      setBlocked(false);

      callLog("[call] remote audio playing", remoteId, {
        readyState: el.readyState,
        paused: el.paused,
        muted: el.muted,
        volume: el.volume,
        tracks: stream.getAudioTracks().map((t) => ({
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          label: t.label,
        })),
      });
    } catch (e: any) {
      if (e?.name === "NotAllowedError") {
        setBlocked(true);
        callWarn("[call] autoplay blocked", remoteId);
        return;
      }

      if (e?.name === "AbortError") {
        callWarn("[call] remote audio play aborted", remoteId);
        return;
      }

      callError("[call] remote audio play error", remoteId, e);
    }
  }, [remoteId, stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (lastStreamRef.current !== stream || el.srcObject !== stream) {
      el.srcObject = stream;
      lastStreamRef.current = stream;
    }

    el.autoplay = true;
    el.setAttribute("playsinline", "true");
    el.volume = 1;
    el.muted = false;
    el.defaultMuted = false;

    const tryPlay = () => {
      callLog("[call] try play", remoteId, {
        readyState: el.readyState,
        paused: el.paused,
      });

      void playAudio();
    };

    el.addEventListener("canplay", tryPlay);
    el.addEventListener("loadedmetadata", tryPlay);

    void playAudio();

    const retryTimer = window.setTimeout(() => {
      void playAudio();
    }, 300);

    return () => {
      window.clearTimeout(retryTimer);
      el.removeEventListener("canplay", tryPlay);
      el.removeEventListener("loadedmetadata", tryPlay);
    };
  }, [stream, remoteId, playAudio]);

  useEffect(() => {
    let raf = 0;
    let closed = false;
    let ctx: AudioContext | null = null;

    async function run() {
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;

        ctx = new Ctx();

        if (ctx.state === "suspended") {
          await ctx.resume().catch(() => {});
        }

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = async () => {
          if (closed) return;

          if (ctx?.state === "suspended") {
            await ctx.resume().catch(() => {});
          }

          analyser.getByteTimeDomainData(data);

          let sum = 0;

          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }

          const rms = Math.sqrt(sum / data.length);
          const level = Math.min(1, Math.max(0, (rms - 0.005) * 12));

          if (level > 0.08) {
            onSpeaking?.(remoteId, level);
          }

          raf = requestAnimationFrame(tick);
        };

        tick();
      } catch {
        // remote meter is optional
      }
    }

    void run();

    return () => {
      closed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ctx) void ctx.close().catch(() => {});
    };
  }, [stream, remoteId, onSpeaking]);

  return (
    <>
      <audio
        ref={ref}
        data-remote={remoteId}
        autoPlay
        playsInline
        style={{ display: "none" }}
      />

      {blocked && (
        <button
          type="button"
          onClick={playAudio}
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.16)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          🔊 音声を再生する
        </button>
      )}
    </>
  );
}