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

  const [micReady, setMicReady] = useState(false);
  const [remoteAudios, setRemoteAudios] = useState<Record<string, RemoteAudioState>>(
    {}
  );

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
        const member = members.find((m) => m.device_id === remoteId);
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

  const setCurrentConnectionId = useCallback((remoteId: string, connectionId: string) => {
    connectionIdsRef.current.set(remoteId, connectionId);
  }, []);

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
    async (pc: RTCPeerConnection, remoteId: string, muted: boolean) => {
      const localTrack = localAudioTrackRef.current;

      for (const sender of pc.getSenders()) {
        if (sender.track?.kind !== "audio" && localTrack?.kind !== "audio") continue;

        try {
          await sender.replaceTrack(muted ? null : localTrack);
          console.log("[call] sender mute sync", {
            remoteId,
            muted,
            senderTrackId: sender.track?.id ?? null,
            localTrackId: localTrack?.id ?? null,
          });
        } catch (e) {
          console.error("[call] sender mute sync error", remoteId, e);
        }
      }
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
      if (localTrack && !isMuted) {
        pc.addTrack(localTrack, localStreamRef.current as MediaStream);
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
          scheduleReconnect(remoteId, 800);
        }

        if (state === "failed") {
          setPeerState(remoteId, "failed");
          closePeer(remoteId, { clearConnectionId: false });
          scheduleReconnect(remoteId, 300);
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
      isMuted,
      notifyStatus,
      sendSignal,
      setCurrentConnectionId,
      setPeerState,
      upsertRemoteAudio,
    ]
  );

  const maybeStartOffer = useCallback(
    async (remoteId: string) => {
      if (!localAudioTrackRef.current && !localStreamRef.current) return;

      const iAmOfferer = deviceId < remoteId;
      if (!iAmOfferer) return;

      let connectionId = getCurrentConnectionId(remoteId);
      if (!connectionId) {
        connectionId = makeConnectionId(deviceId, remoteId);
        setCurrentConnectionId(remoteId, connectionId);
      }

      const pc = createPeerConnection(remoteId, connectionId);

      if (offeredPeersRef.current.has(remoteId)) return;
      if (pc.signalingState !== "stable") return;

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
      createPeerConnection,
      deviceId,
      getCurrentConnectionId,
      sendSignal,
      setCurrentConnectionId,
      setPeerState,
    ]
  );

  const scheduleReconnect = useCallback(
    (remoteId: string, delay = 300) => {
      const iAmOfferer = deviceId < remoteId;
      if (!iAmOfferer) return;
      if (!localAudioTrackRef.current && !localStreamRef.current) return;

      clearReconnectTimer(remoteId);

      const timer = window.setTimeout(() => {
        reconnectTimersRef.current.delete(remoteId);

        const nextConnectionId = makeConnectionId(deviceId, remoteId);
        closePeer(remoteId, { clearConnectionId: false });
        setCurrentConnectionId(remoteId, nextConnectionId);

        void maybeStartOffer(remoteId);
      }, delay);

      reconnectTimersRef.current.set(remoteId, timer);
    },
    [clearReconnectTimer, closePeer, deviceId, maybeStartOffer, setCurrentConnectionId]
  );

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
          closePeer(remoteId, { clearConnectionId: false });
          setCurrentConnectionId(remoteId, incomingConnectionId);
          currentConnectionId = incomingConnectionId;
        }
      } else {
        if (!currentConnectionId || currentConnectionId !== incomingConnectionId) {
          console.warn("[call] ignore stale signal", row.signal_type, remoteId, {
            currentConnectionId,
            incomingConnectionId,
          });
          return;
        }
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
              incomingConnectionId
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
          scheduleReconnect(remoteId, 300);
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

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      localAudioTrackRef.current = null;
    };
  }, [
    clearReconnectTimer,
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
    if (!micReady || !localStreamRef.current) return;

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
    if (!sessionId) return;

    subscribedAtRef.current = new Date(Date.now() - 5000).toISOString();

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
          await handleSignal(row);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, handleSignal]);

  useEffect(() => {
    if (!sessionId || !deviceId) return;

    const bootRecentSignals = async () => {
      const since = subscribedAtRef.current;
      if (!since) return;

      const { data, error } = await supabase
        .from("call_signals")
        .select("*")
        .eq("session_id", sessionId)
        .gte("created_at", since)
        .or(`to_device_id.is.null,to_device_id.eq.${deviceId}`)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) {
        console.error("[call] boot recent signals error", error);
        return;
      }

      for (const row of (data ?? []) as SignalRow[]) {
        await handleSignal(row);
      }
    };

    const timer = window.setTimeout(() => {
      void bootRecentSignals();
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sessionId, deviceId, handleSignal]);

  useEffect(() => {
    if (!micReady) return;

    const remoteIds = members
      .map((m) => m.device_id)
      .filter((id) => id && id !== deviceId);

    for (const existingId of Array.from(pcsRef.current.keys())) {
      if (!remoteIds.includes(existingId)) {
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
  }, [
    members,
    micReady,
    deviceId,
    closePeer,
    emitPeerStates,
    getCurrentConnectionId,
    maybeStartOffer,
    setCurrentConnectionId,
  ]);

  useEffect(() => {
    if (!micReady) return;

    const timer = window.setInterval(() => {
      const remoteIds = members
        .map((m) => m.device_id)
        .filter((id) => id && id !== deviceId);

      for (const remoteId of remoteIds) {
        const hasRemoteStream = remoteStreamsRef.current.has(remoteId);
        const pc = pcsRef.current.get(remoteId);

        if (hasRemoteStream) continue;
        if (pc && pc.signalingState !== "stable") continue;

        void maybeStartOffer(remoteId);
      }
    }, 2500);

    return () => {
      window.clearInterval(timer);
    };
  }, [members, micReady, deviceId, maybeStartOffer]);

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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;

    el.srcObject = stream;
    el.autoplay = true;
    el.muted = false;
    el.volume = 1;
    el.setAttribute("playsinline", "true");

    const tryPlay = async () => {
      try {
        await el.play();
        if (!cancelled) {
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
        }
      } catch (e: any) {
        if (e?.name === "AbortError") {
          console.warn("[call] remote audio play aborted", remoteId);
          return;
        }
        console.error("[call] remote audio play error", remoteId, e);
      }
    };

    const onCanPlay = () => {
      console.log("[call] audio canplay", remoteId);
      void tryPlay();
    };

    const onLoadedMetadata = () => {
      console.log("[call] audio loadedmetadata", remoteId, {
        readyState: el.readyState,
        paused: el.paused,
      });
    };

    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    void tryPlay();

    return () => {
      cancelled = true;
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [stream, remoteId]);

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      controls
      style={{ width: 220 }}
    />
  );
}