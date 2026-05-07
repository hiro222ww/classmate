import { useCallback, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { callError, callLog, callWarn } from "./debug";
import { detectConnectionType } from "./connectionStats";
import { logVoiceConnectionEvent } from "./voiceLogger";
import { makeConnectionId, FALLBACK_ICE_SERVERS } from "./voiceConstants";
import type {
  Member,
  PeerState,
  SignalPayload,
  SignalRow,
  SignalType,
  VoiceRoute,
} from "./types";

type Params = {
  sessionId: string;
  deviceId: string;
  members: Member[];
  isMuted: boolean;
  micReady: boolean;
  signalReady: boolean;
  localStreamRef: React.RefObject<MediaStream | null>;
  localAudioTrackRef: React.RefObject<MediaStreamTrack | null>;
  iceServersRef: React.MutableRefObject<RTCIceServer[]>;
  voiceRouteRef: React.MutableRefObject<VoiceRoute>;
  enableTurnFallback: () => Promise<boolean>;
  onStatusChange?: (text: string) => void;
  onPeerStatesChange?: (states: Record<string, PeerState>) => void;
  upsertRemoteAudio: (remoteId: string, stream: MediaStream) => void;
  removeRemoteAudio: (remoteId: string) => void;
};

export function usePeerConnections({
  sessionId,
  deviceId,
  members,
  isMuted,
  micReady,
  signalReady,
  localStreamRef,
  localAudioTrackRef,
  iceServersRef,
  voiceRouteRef,
  enableTurnFallback,
  onStatusChange,
  onPeerStatesChange,
  upsertRemoteAudio,
  removeRemoteAudio,
}: Params) {
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
      .filter((id): id is string => Boolean(id) && id !== deviceId);
  }, [activeMembers, deviceId]);

  const notifyStatus = useCallback(
    (text: string) => {
      onStatusChange?.(text);
    },
    [onStatusChange]
  );

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
      } else {
        console.log("[call] signal sent", {
          toDeviceId,
          signalType,
          connectionId: payload.connectionId,
        });
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

      removeRemoteAudio(remoteId);
    },
    [
      clearReconnectTimer,
      clearCurrentConnectionId,
      emitPeerStates,
      removeRemoteAudio,
    ]
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
    [
      clearReconnectTimer,
      closePeer,
      deviceId,
      localAudioTrackRef,
      localStreamRef,
      setCurrentConnectionId,
    ]
  );

  const handleTurnFallback = useCallback(
    async (remoteId: string) => {
      const ok = await enableTurnFallback();
      if (!ok) return false;

      void logVoiceConnectionEvent({
        sessionId,
        deviceId,
        remoteDeviceId: remoteId,
        phase: "fallback",
        route: "turn",
        usedTurn: true,
        connectionState: "connecting",
        voiceRoute: "turn",
      });

      const nextConnectionId = makeConnectionId(deviceId, remoteId);
      closePeer(remoteId, { clearConnectionId: false });
      setCurrentConnectionId(remoteId, nextConnectionId);
      scheduleReconnect(remoteId, 300);

      return true;
    },
    [
      closePeer,
      deviceId,
      enableTurnFallback,
      scheduleReconnect,
      sessionId,
      setCurrentConnectionId,
    ]
  );

  const createPeerConnection = useCallback(
    (remoteId: string, connectionId: string) => {
      const existing = pcsRef.current.get(remoteId);
      const currentId = getCurrentConnectionId(remoteId);

      if (existing && currentId === connectionId) return existing;

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

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        callLog("[call] ICE candidate", {
          remoteId,
          candidate: event.candidate.candidate,
        });

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

        remoteStreamsRef.current.set(remoteId, stream);
        upsertRemoteAudio(remoteId, stream);

        window.setTimeout(() => {
          const audioEl = document.querySelector(
            `audio[data-remote="${remoteId}"]`
          ) as HTMLAudioElement | null;

          if (!audioEl) return;

          audioEl.muted = false;
          audioEl.defaultMuted = false;
          audioEl.volume = 1;
          audioEl.play().catch((e) => {
            callWarn("[call] delayed remote audio play failed", remoteId, e);
          });
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
        callLog(
          "[call] ice state",
          remoteId,
          connectionId,
          pc.iceConnectionState
        );

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

          void logVoiceConnectionEvent({
            sessionId,
            deviceId,
            remoteDeviceId: remoteId,
            phase: "failed",
            route: voiceRouteRef.current === "turn" ? "turn" : "p2p",
            usedTurn: voiceRouteRef.current === "turn",
            connectionState: "failed",
            voiceRoute: voiceRouteRef.current,
          });

          if (voiceRouteRef.current === "stun") {
            void handleTurnFallback(remoteId).then((ok) => {
              if (!ok) scheduleReconnect(remoteId, 1500);
            });
            return;
          }

          scheduleReconnect(remoteId, 1500);
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

          if (voiceRouteRef.current === "stun") {
            window.setTimeout(() => {
              const currentPc = pcsRef.current.get(remoteId);
              if (!currentPc) return;

              const stillBad =
                currentPc.connectionState === "connecting" ||
                currentPc.iceConnectionState === "checking" ||
                currentPc.iceConnectionState === "disconnected";

              if (!stillBad) return;

              void handleTurnFallback(remoteId);
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

          window.setTimeout(async () => {
            try {
              const result = await detectConnectionType(pc);

              callLog("[call] route", result);

              void logVoiceConnectionEvent({
                sessionId,
                deviceId,
                remoteDeviceId: remoteId,
                phase: "connected",
                route: result.route,
                usedTurn:
                  result.route === "turn" ||
                  result.localType === "relay" ||
                  result.remoteType === "relay",
                connectionState: "connected",
                localCandidateType: result.localType,
                remoteCandidateType: result.remoteType,
                voiceRoute: voiceRouteRef.current,
              });
            } catch (e) {
              callWarn("[call] stats error", e);
            }
          }, 1000);
        }

        if (state === "disconnected") {
          callWarn("[call] peer disconnected, wait", remoteId);
          setPeerState(remoteId, "connecting");
        }

        if (state === "failed") {
          setPeerState(remoteId, "failed");

          void logVoiceConnectionEvent({
            sessionId,
            deviceId,
            remoteDeviceId: remoteId,
            phase: "failed",
            route: voiceRouteRef.current === "turn" ? "turn" : "p2p",
            usedTurn: voiceRouteRef.current === "turn",
            connectionState: "failed",
            voiceRoute: voiceRouteRef.current,
          });

          if (voiceRouteRef.current === "stun") {
            void handleTurnFallback(remoteId).then((ok) => {
              if (!ok) {
                closePeer(remoteId, { clearConnectionId: false });
                scheduleReconnect(remoteId, 1500);
              }
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
      getCurrentConnectionId,
      handleTurnFallback,
      iceServersRef,
      isMuted,
      localAudioTrackRef,
      localStreamRef,
      notifyStatus,
      scheduleReconnect,
      sendSignal,
      sessionId,
      setCurrentConnectionId,
      setPeerState,
      upsertRemoteAudio,
      voiceRouteRef,
    ]
  );

  const maybeStartOffer = useCallback(
    async (remoteId: string) => {
      const isOfferOwner = deviceId < remoteId;

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
        const shouldRetryOffer =
          !existingPc ||
          existingPc.connectionState === "new" ||
          existingPc.connectionState === "connecting";

        if (!shouldRetryOffer) {
          callLog("[call] skip offer: already offered", remoteId, connectionId);
          return;
        }

        callWarn("[call] retry offer after previous offer", remoteId);
        offeredPeersRef.current.delete(remoteId);
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

      void logVoiceConnectionEvent({
        sessionId,
        deviceId,
        remoteDeviceId: remoteId,
        phase: "start",
        route: voiceRouteRef.current === "turn" ? "turn" : "p2p",
        usedTurn: voiceRouteRef.current === "turn",
        connectionState: "connecting",
        voiceRoute: voiceRouteRef.current,
      });

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
      localAudioTrackRef,
      localStreamRef,
      sendSignal,
      sessionId,
      setCurrentConnectionId,
      setPeerState,
      voiceRouteRef,
    ]
  );

  const handleSignal = useCallback(
    async (row: SignalRow) => {
      console.log("[call] signal received", {
        id: row?.id,
        type: row?.signal_type,
        from: row?.from_device_id,
        to: row?.to_device_id,
        me: deviceId,
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
            callWarn("[call] addIceCandidate ignored", remoteId, e);
          }

          return;
        }
      } catch (e) {
        callError("[call] signal handle error", row.signal_type, remoteId, e);

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
    maybeStartOfferRef.current = maybeStartOffer;
  }, [maybeStartOffer]);

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

    console.log("[peer start check]", {
      micReady,
      signalReady,
      remoteIds,
      members: members.map((m) => ({
        device_id: m.device_id,
        is_in_call: m.is_in_call,
      })),
    });

    if (!micReady) return;
    if (!signalReady) return;
    if (remoteIds.length < 1) return;

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

        void maybeStartOffer(remoteId);
      }
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [members, micReady, signalReady, deviceId, maybeStartOffer, getRemoteIds]);

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
          callWarn("[call] watchdog reconnect", remoteId, {
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
          });

          scheduleReconnect(remoteId, 1500);
        }
      }
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [members, micReady, signalReady, deviceId, scheduleReconnect, getRemoteIds]);

  useEffect(() => {
    return () => {
      for (const remoteId of Array.from(pcsRef.current.keys())) {
        closePeer(remoteId, { clearConnectionId: true });
      }
    };
  }, [closePeer]);

  return {
    handleSignal,
  };
}