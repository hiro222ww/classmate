"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Member = {
  device_id: string;
  display_name: string;
  photo_path?: string | null;
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

type CallVoiceLayerProps = {
  sessionId: string;
  deviceId: string;
  members: Member[];
  isMuted: boolean;
  onMicReadyChange?: (ready: boolean) => void;
  onMicLevelChange?: (level: number) => void;
  onRemoteCountChange?: (count: number) => void;
  onStatusChange?: (text: string) => void;
  onPeerStatesChange?: (states: Record<string, PeerState>) => void;
};

function makeConnectionId(localId: string, remoteId: string) {
  return `${localId}__${remoteId}__${Date.now()}__${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export default function CallVoiceLayer({
  sessionId,
  deviceId,
  members,
  isMuted,
  onMicReadyChange,
  onMicLevelChange,
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
  const subscribedAtRef = useRef<string>("");
  const peerStatesRef = useRef<Map<string, PeerState>>(new Map());

  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const connectionIdsRef = useRef<Map<string, string>>(new Map());
  const offeredPeersRef = useRef<Set<string>>(new Set());
  const startedPeersRef = useRef<Set<string>>(new Set());

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const retrySubscribeTimerRef = useRef<number | null>(null);
  const isSubscribingRef = useRef(false);

  const handleSignalRef = useRef<(row: SignalRow) => Promise<void> | void>(
    () => {}
  );

  const [micReady, setMicReady] = useState(false);
  const [signalReady, setSignalReady] = useState(false);
  const [remoteAudios, setRemoteAudios] = useState<
    Record<string, RemoteAudioState>
  >({});

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

  const clearRetrySubscribeTimer = useCallback(() => {
    if (retrySubscribeTimerRef.current) {
      window.clearTimeout(retrySubscribeTimerRef.current);
      retrySubscribeTimerRef.current = null;
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
        console.error("[call] signal insert error", error);
        notifyStatus(`signal error: ${error.message}`);
      }
    },
    [sessionId, deviceId, notifyStatus]
  );

  const syncSendersMuted = useCallback(
    async (_pc: RTCPeerConnection, remoteId: string, muted: boolean) => {
      const localTrack = localAudioTrackRef.current;
      if (!localTrack) return;

      localTrack.enabled = !muted;

      console.log("[call] sender mute sync", {
        remoteId,
        muted,
        localTrackId: localTrack.id,
        enabled: localTrack.enabled,
        readyState: localTrack.readyState,
      });
    },
    []
  );

  const syncAllPeerSendersMuted = useCallback(
    async (muted: boolean) => {
      const entries = Array.from(pcsRef.current.entries());

      await Promise.all(
        entries.map(async ([remoteId, pc]) => {
          await syncSendersMuted(pc, remoteId, muted);
        })
      );
    },
    [syncSendersMuted]
  );

  const closePeer = useCallback(
    (remoteId: string, opts?: { clearConnectionId?: boolean }) => {
      const shouldClearConnectionId = opts?.clearConnectionId ?? false;

      console.log("[call] close peer", remoteId, {
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

      console.log("[call] flush pending ice", remoteId, connectionId, queued.length);

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

  const maybeStartOffer = useCallback(
    async (remoteId: string) => {
      if (!localAudioTrackRef.current && !localStreamRef.current) {
        console.log("[call] skip offer: local audio not ready", remoteId);
        return;
      }

      const iAmOfferer = deviceId < remoteId;

      console.log("[call] offer role check", {
        deviceId,
        remoteId,
        iAmOfferer,
      });

     // if (!iAmOfferer) return;

      let connectionId = getCurrentConnectionId(remoteId);

      if (!connectionId) {
        connectionId = makeConnectionId(deviceId, remoteId);
        setCurrentConnectionId(remoteId, connectionId);
      }

      const pc = createPeerConnection(remoteId, connectionId);

      if (offeredPeersRef.current.has(remoteId)) {
        console.log("[call] skip offer: already offered", remoteId, connectionId);
        return;
      }

      if (pc.signalingState !== "stable") {
        console.log(
          "[call] skip offer: non-stable",
          remoteId,
          connectionId,
          pc.signalingState
        );
        return;
      }

      if (
        pc.connectionState === "connecting" ||
        pc.connectionState === "connected"
      ) {
        console.log(
          "[call] skip offer: already connecting/connected",
          remoteId,
          connectionId,
          pc.connectionState
        );
        return;
      }

      offeredPeersRef.current.add(remoteId);
      clearReconnectTimer(remoteId);
      setPeerState(remoteId, "connecting");

      try {
        console.log("[call] create offer start", remoteId, connectionId);

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
        });

        const activeConnectionId = getCurrentConnectionId(remoteId);

        if (!activeConnectionId || activeConnectionId !== connectionId) {
          offeredPeersRef.current.delete(remoteId);
          return;
        }

        if (pc.signalingState !== "stable") {
          console.warn(
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

        console.log("[call] offer sent", remoteId, connectionId);
      } catch (e) {
        offeredPeersRef.current.delete(remoteId);
        console.error("[call] create offer error", remoteId, connectionId, e);
      }
    },
    [
      clearReconnectTimer,
      deviceId,
      getCurrentConnectionId,
      sendSignal,
      setCurrentConnectionId,
      setPeerState,
    ]
  );

  const scheduleReconnect = useCallback(
    (remoteId: string, delay = 800) => {
      const iAmOfferer = deviceId < remoteId;
      if (!iAmOfferer) return;
      if (!localAudioTrackRef.current && !localStreamRef.current) return;

      console.log("[call] schedule reconnect", remoteId, { delay });

      clearReconnectTimer(remoteId);

      const timer = window.setTimeout(() => {
        reconnectTimersRef.current.delete(remoteId);

        const nextConnectionId = makeConnectionId(deviceId, remoteId);
        closePeer(remoteId, { clearConnectionId: false });
        setCurrentConnectionId(remoteId, nextConnectionId);

        console.log("[call] reconnect prepared", remoteId, nextConnectionId);

        void maybeStartOffer(remoteId);
      }, delay);

      reconnectTimersRef.current.set(remoteId, timer);
    },
    [
      clearReconnectTimer,
      closePeer,
      deviceId,
      maybeStartOffer,
      setCurrentConnectionId,
    ]
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

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      const localTrack = localAudioTrackRef.current;
      const localStream = localStreamRef.current;

      if (localTrack && localStream) {
        pc.addTrack(localTrack, localStream);
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

        console.log("[call] ontrack", remoteId, connectionId, {
          trackCount: stream.getTracks().length,
          audioTracks: stream.getAudioTracks().map((t) => ({
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState,
            label: t.label,
          })),
        });

        upsertRemoteAudio(remoteId, stream);
      };

      pc.onsignalingstatechange = () => {
        console.log("[call] signaling state", remoteId, connectionId, pc.signalingState);
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[call] ice state", remoteId, connectionId, pc.iceConnectionState);
        notifyStatus(`ice ${remoteId}: ${pc.iceConnectionState}`);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        if (
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed"
        ) {
          console.warn("[call] ICE dead → reconnect", remoteId, connectionId);
          setPeerState(remoteId, "failed");
          scheduleReconnect(remoteId, 900);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;

        console.log("[call] connection state", remoteId, connectionId, state);

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
        }

        if (state === "disconnected") {
          setPeerState(remoteId, "failed");
          scheduleReconnect(remoteId, 1200);
        }

        if (state === "failed") {
          setPeerState(remoteId, "failed");
          closePeer(remoteId, { clearConnectionId: false });
          scheduleReconnect(remoteId, 1000);
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
      getCurrentConnectionId,
      notifyStatus,
      scheduleReconnect,
      sendSignal,
      setCurrentConnectionId,
      setPeerState,
      upsertRemoteAudio,
    ]
  );

  const handleSignal = useCallback(
    async (row: SignalRow) => {
      console.log("[call] signal received raw", {
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
      //if (row.to_device_id && row.to_device_id !== deviceId) return;
      if (row.session_id !== sessionId) return;

      const remoteId = row.from_device_id;
      const payload = row.payload ?? {};
      const incomingConnectionId = payload.connectionId;

      if (row.signal_type === "leave") {
        console.log("[call] leave received", remoteId);
        closePeer(remoteId, { clearConnectionId: true });
        return;
      }

      if (!incomingConnectionId) {
        console.warn("[call] ignore signal without connectionId", row.signal_type, remoteId);
        return;
      }

      let currentConnectionId = getCurrentConnectionId(remoteId);

      if (row.signal_type === "offer") {
        if (currentConnectionId !== incomingConnectionId) {
          console.log("[call] new offer connection id", remoteId, {
            currentConnectionId,
            incomingConnectionId,
          });
          closePeer(remoteId, { clearConnectionId: false });
          setCurrentConnectionId(remoteId, incomingConnectionId);
          currentConnectionId = incomingConnectionId;
          offeredPeersRef.current.delete(remoteId);
          startedPeersRef.current.add(remoteId);
        }
      } else if (!currentConnectionId || currentConnectionId !== incomingConnectionId) {
        console.warn("[call] ignore stale signal", row.signal_type, remoteId, {
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
            console.warn(
              "[call] ignore offer in non-stable state",
              remoteId,
              incomingConnectionId,
              pc.signalingState
            );
            return;
          }

          console.log("[call] applying offer", remoteId, incomingConnectionId);

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(remoteId, incomingConnectionId);

          setPeerState(remoteId, "connecting");

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await sendSignal(remoteId, "answer", {
            connectionId: incomingConnectionId,
            sdp: pc.localDescription,
          });

          console.log("[call] answer sent", remoteId, incomingConnectionId);
          return;
        }

        if (row.signal_type === "answer") {
          const sdp = payload.sdp;
          if (!sdp) return;

          if (pc.signalingState !== "have-local-offer") {
            console.warn(
              "[call] ignore answer in invalid state",
              remoteId,
              incomingConnectionId,
              pc.signalingState
            );
            return;
          }

          console.log("[call] applying answer", remoteId, incomingConnectionId);

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(remoteId, incomingConnectionId);

          console.log("[call] answer applied", remoteId, incomingConnectionId);
          return;
        }

        if (row.signal_type === "ice") {
          const candidate = payload.candidate;
          if (!candidate) return;

          if (!pc.remoteDescription) {
            const queued = pendingIceRef.current.get(remoteId) ?? [];
            queued.push(candidate);
            pendingIceRef.current.set(remoteId, queued);

            console.log(
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
            console.warn("[call] addIceCandidate ignored", remoteId, incomingConnectionId, e);
          }

          return;
        }
      } catch (e) {
        console.error(
          "[call] signal handle error",
          row.signal_type,
          remoteId,
          incomingConnectionId,
          e
        );

        if (row.signal_type === "offer" || row.signal_type === "answer") {
          closePeer(remoteId, { clearConnectionId: false });
          scheduleReconnect(remoteId, 1000);
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
    let mounted = true;

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
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

        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.enabled = !isMuted;
        }

        console.log("[call] local audio track", {
          deviceId,
          trackId: localAudioTrackRef.current?.id ?? null,
          label: localAudioTrackRef.current?.label ?? null,
        });

        setMicReady(true);
        onMicReadyChange?.(true);
        notifyStatus("");
      } catch (e) {
        console.error("[call] mic error", e);
        setMicReady(false);
        onMicReadyChange?.(false);
        notifyStatus("マイク取得に失敗");
      }
    };

    void init();

    return () => {
      mounted = false;

      clearRetrySubscribeTimer();
      isSubscribingRef.current = false;

      for (const remoteId of Array.from(reconnectTimersRef.current.keys())) {
        clearReconnectTimer(remoteId);
      }

      for (const remoteId of Array.from(pcsRef.current.keys())) {
        try {
          const connectionId = getCurrentConnectionId(remoteId) ?? undefined;
          void sendSignal(remoteId, "leave", { connectionId });
        } catch {}
      }

      for (const remoteId of Array.from(pcsRef.current.keys())) {
        closePeer(remoteId, { clearConnectionId: true });
      }

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      localAudioTrackRef.current = null;
    };
  }, [
    clearReconnectTimer,
    clearRetrySubscribeTimer,
    closePeer,
    deviceId,
    getCurrentConnectionId,
    notifyStatus,
    onMicReadyChange,
    sendSignal,
  ]);

  useEffect(() => {
    void syncAllPeerSendersMuted(isMuted);
  }, [isMuted, syncAllPeerSendersMuted]);

  useEffect(() => {
    if (!micReady) return;
    if (!localStreamRef.current) return;

    let raf = 0;
    let closed = false;
    let ctx: AudioContext | null = null;

    const run = async () => {
      try {
        ctx = new AudioContext();
        audioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(localStreamRef.current as MediaStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (closed) return;

          analyser.getByteTimeDomainData(data);

          let sum = 0;

          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }

          const rms = Math.sqrt(sum / data.length);
          onMicLevelChange?.(rms);
          raf = requestAnimationFrame(tick);
        };

        tick();
      } catch (e) {
        console.error("[call] meter error", e);
      }
    };

    void run();

    return () => {
      closed = true;

      if (raf) cancelAnimationFrame(raf);

      if (ctx) {
        void ctx.close().catch(() => {});
      }

      if (audioCtxRef.current === ctx) {
        audioCtxRef.current = null;
      }
    };
  }, [micReady, onMicLevelChange]);

  useEffect(() => {
    if (!sessionId || !deviceId) return;

    let alive = true;
    setSignalReady(false);

    const bootRecentSignals = async () => {
      const since = subscribedAtRef.current;
      if (!since) return;

      const { data, error } = await supabase
        .from("call_signals")
        .select("*")
        .eq("session_id", sessionId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) {
        console.warn("[call] boot recent signals skipped", {
          message: error.message,
          details: (error as any)?.details ?? null,
          hint: (error as any)?.hint ?? null,
          code: (error as any)?.code ?? null,
        });
        return;
      }

      for (const row of (data ?? []) as SignalRow[]) {
        if (!alive) return;
        if (row.from_device_id === deviceId) continue;
        //if (row.to_device_id && row.to_device_id !== deviceId) continue;
        await handleSignalRef.current(row);
      }
    };

    const startSubscribe = () => {
      if (!alive) return;
      if (channelRef.current) return;
      if (isSubscribingRef.current) return;

      isSubscribingRef.current = true;
      subscribedAtRef.current = new Date(Date.now() - 15000).toISOString();

      console.log("🔥 SUBSCRIBE CREATED", {
        sessionId,
        deviceId,
      });

      const channel = supabase
  .channel(`call-signals-${sessionId}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "call_signals",
      filter: `session_id=eq.${sessionId}`,
    },
    async (payload) => {
      const row = payload.new as SignalRow;
      await handleSignalRef.current(row);
    }
  )
        .subscribe(async (status) => {
          console.log("[call] signal subscribe status", status);

          if (!alive) return;

          if (status === "SUBSCRIBED") {
            isSubscribingRef.current = false;
            clearRetrySubscribeTimer();

            await bootRecentSignals();

            if (!alive) return;
            setSignalReady(true);
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[call] signal channel error → retry", status);

            isSubscribingRef.current = false;
            setSignalReady(false);

            if (channelRef.current === channel) {
              void supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }

            clearRetrySubscribeTimer();

            retrySubscribeTimerRef.current = window.setTimeout(() => {
              retrySubscribeTimerRef.current = null;
              startSubscribe();
            }, 1000);

            return;
          }

          if (status === "CLOSED") {
            console.warn("[call] signal channel closed");

            isSubscribingRef.current = false;
            setSignalReady(false);

            if (channelRef.current === channel) {
              channelRef.current = null;
            }

            return;
          }
        });

      channelRef.current = channel;
    };

    startSubscribe();

    return () => {
      alive = false;
      setSignalReady(false);
      clearRetrySubscribeTimer();
      isSubscribingRef.current = false;

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, deviceId, clearRetrySubscribeTimer]);

  useEffect(() => {
    console.log("[call] offer effect check", {
      micReady,
      signalReady,
      deviceId,
      members: members.map((m) => m.device_id),
    });

    if (!micReady) return;
    if (!signalReady) return;

    const remoteIds = members
      .map((m) => m.device_id)
      .filter((id) => id && id !== deviceId);

    console.log("[call] remoteIds for offer", {
      remoteIds,
    });

    for (const existingId of Array.from(pcsRef.current.keys())) {
      if (!remoteIds.includes(existingId)) {
        startedPeersRef.current.delete(existingId);
        peerStatesRef.current.delete(existingId);
        emitPeerStates();
        closePeer(existingId, { clearConnectionId: true });
      }
    }

    for (const remoteId of remoteIds) {
      if (startedPeersRef.current.has(remoteId)) continue;

      startedPeersRef.current.add(remoteId);

      if (!getCurrentConnectionId(remoteId)) {
        setCurrentConnectionId(remoteId, makeConnectionId(deviceId, remoteId));
      }

      console.log("[call] try maybeStartOffer", {
        remoteId,
        deviceId,
      });

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
    maybeStartOffer,
    setCurrentConnectionId,
  ]);

  useEffect(() => {
    if (!micReady) return;
    if (!signalReady) return;

    const timer = window.setInterval(() => {
      const remoteIds = members
        .map((m) => m.device_id)
        .filter((id) => id && id !== deviceId);

      for (const remoteId of remoteIds) {
        const hasRemoteStream = remoteStreamsRef.current.has(remoteId);
        const pc = pcsRef.current.get(remoteId);

        if (hasRemoteStream) continue;
        if (pc && pc.signalingState !== "stable") continue;

        if (
          pc &&
          (pc.connectionState === "connecting" ||
            pc.connectionState === "connected")
        ) {
          continue;
        }

        void maybeStartOffer(remoteId);
      }
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [members, micReady, signalReady, deviceId, maybeStartOffer]);

  useEffect(() => {
    if (!micReady) return;
    if (!signalReady) return;

    const timer = window.setInterval(() => {
      const remoteIds = members
        .map((m) => m.device_id)
        .filter((id) => id && id !== deviceId);

      for (const remoteId of remoteIds) {
        const hasRemoteStream = remoteStreamsRef.current.has(remoteId);
        const pc = pcsRef.current.get(remoteId);

        if (hasRemoteStream) continue;
        if (!pc) continue;

        const badState =
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected" ||
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "disconnected";

        if (badState) {
          console.warn("[call] watchdog reconnect", remoteId, {
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
          });

          scheduleReconnect(remoteId, 500);
        }
      }
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [members, micReady, signalReady, deviceId, scheduleReconnect]);

  return (
    <>
      {Object.entries(remoteAudios).map(([remoteId, state]) => (
        <RemoteAudio key={remoteId} stream={state.stream} remoteId={remoteId} />
      ))}
    </>
  );
}

function RemoteAudio({
  stream,
  remoteId,
}: {
  stream: MediaStream;
  remoteId: string;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const lastStreamRef = useRef<MediaStream | null>(null);
  const [blocked, setBlocked] = useState(false);

  const playAudio = async () => {
    const el = ref.current;
    if (!el) return;

    try {
      await el.play();
      setBlocked(false);

      console.log("[call] remote audio playing", remoteId, {
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
        console.warn("[call] autoplay blocked", remoteId);
        return;
      }

      if (e?.name === "AbortError") {
        console.warn("[call] remote audio play aborted", remoteId);
        return;
      }

      console.error("[call] remote audio play error", remoteId, e);
    }
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (lastStreamRef.current !== stream || el.srcObject !== stream) {
      el.srcObject = stream;
      lastStreamRef.current = stream;
    }

    el.autoplay = true;
    el.muted = false;
    el.volume = 1;
    el.setAttribute("playsinline", "true");

    const onCanPlay = () => {
      console.log("[call] audio canplay", remoteId);
      void playAudio();
    };

    const onLoadedMetadata = () => {
      console.log("[call] audio loadedmetadata", remoteId, {
        readyState: el.readyState,
        paused: el.paused,
      });

      void playAudio();
    };

    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("loadedmetadata", onLoadedMetadata);

    void playAudio();

    return () => {
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [stream, remoteId]);

  return (
    <>
      <audio ref={ref} autoPlay playsInline controls style={{ width: 220 }} />

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
          🔊 音声を有効にする
        </button>
      )}
    </>
  );
}