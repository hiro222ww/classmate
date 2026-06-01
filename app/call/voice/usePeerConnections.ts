"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SignalPayload, SignalRow, SignalType } from "./useCallSignaling";
import {
  checkVoiceMeshExpectations,
  compactDeviceId,
  logHealPeerAction as emitHealPeerAction,
  logHealRecoverySuccess,
  logPeerStateChange,
  logPeerStateWarning,
  logRemoteTrackEvent,
  logVoiceMeshPeerSummary,
  voiceDebugLog,
  type VoiceMeshPeerSummaryEntry,
} from "./voiceDiagnostics";
import { recordCallReloadContext } from "@/lib/callReloadDiagnostics";

type Member = {
  device_id: string;
  display_name: string;
  photo_path?: string | null;
  screen?: string | null;
  last_seen_at?: string | null;
  is_in_call?: boolean;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";
type VoiceRoute = "stun" | "turn";
type OsType = "windows" | "mac" | "ios" | "android" | "unknown";

type RemoteAudioState = {
  stream: MediaStream;
  member?: Member;
  attachSeq: number;
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

const TRACK_ENDED_RECONNECT_MS = 300;
const HEAL_PEER_COOLDOWN_MS = 800;
const MESH_SUMMARY_DEBOUNCE_MS = 150;
const CLOSE_FOR_RECONNECT = {
  clearConnectionId: false,
  preserveRemoteAudio: true,
  reason: "reconnect_preserve_audio",
} as const;

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

type PeerSignalTimestamps = {
  lastOfferAt: number | null;
  lastAnswerAt: number | null;
  lastIceCandidateAt: number | null;
  lastOnTrackAt: number | null;
  lastUnmuteAt: number | null;
};

type PeerMeta = {
  lastWarning: string | null;
  lastHealAction: string | null;
};

function emptyPeerSignalTimestamps(): PeerSignalTimestamps {
  return {
    lastOfferAt: null,
    lastAnswerAt: null,
    lastIceCandidateAt: null,
    lastOnTrackAt: null,
    lastUnmuteAt: null,
  };
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
  const createPeerConnectionRef = useRef<
    ((remoteId: string, connectionId: string) => RTCPeerConnection) | null
  >(null);
  const ensurePeerConnectionRef = useRef<
    ((remoteId: string, reason: string) => boolean) | null
  >(null);
  const scheduleReconnectRef = useRef<
    ((
      remoteId: string,
      delay?: number,
      opts?: { reason?: string; force?: boolean }
    ) => boolean) | null
  >(null);
  const setPeerStateRef = useRef<(remoteId: string, state: PeerState) => void>(
    () => {}
  );
  const attachRemoteTrackDiagnosticsRef = useRef<
    (remoteId: string, track: MediaStreamTrack) => void
  >(() => {});

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
  const peerSnapshotRef = useRef<
    Map<
      string,
      {
        connectionState?: RTCPeerConnectionState;
        iceConnectionState?: RTCIceConnectionState;
        signalingState?: RTCSignalingState;
        iceGatheringState?: RTCIceGatheringState;
        remoteTracksCount?: number;
        hasRemoteStream?: boolean;
      }
    >
  >(new Map());
  const peerEverConnectedRef = useRef<Set<string>>(new Set());
  const recoveryStartedAtRef = useRef<Map<string, number>>(new Map());
  const iceCheckingTimersRef = useRef<Map<string, number>>(new Map());
  const connectingTimersRef = useRef<Map<string, number>>(new Map());
  const attachedTrackIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const trackEndedAtRef = useRef<Map<string, number>>(new Map());
  const reconnectPendingRef = useRef<
    Map<string, { reason: string; scheduledInMs: number; scheduledAt: number }>
  >(new Map());
  const lastHealActionAtRef = useRef<Map<string, number>>(new Map());
  const peerSignalTimestampsRef = useRef<Map<string, PeerSignalTimestamps>>(
    new Map()
  );
  const peerMetaRef = useRef<Map<string, PeerMeta>>(new Map());
  const meshSummaryTimerRef = useRef<number | null>(null);
  const meshNotConnectedTimerRef = useRef<number | null>(null);

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

  const getPeerMedia = useCallback((remoteId: string) => {
    const remoteStream = remoteStreamsRef.current.get(remoteId);
    return {
      hasRemoteStream: !!remoteStream,
      remoteTracksCount: remoteStream?.getAudioTracks().length ?? 0,
    };
  }, []);

  const hasLiveRemoteStream = useCallback((remoteId: string) => {
    const stream = remoteStreamsRef.current.get(remoteId);
    return (
      !!stream &&
      stream.getAudioTracks().some((track) => track.readyState === "live")
    );
  }, []);

  const clearPeerWatchdogTimers = useCallback((remoteId: string) => {
    const checkingTimer = iceCheckingTimersRef.current.get(remoteId);
    if (checkingTimer) {
      window.clearTimeout(checkingTimer);
      iceCheckingTimersRef.current.delete(remoteId);
    }

    const connectingTimer = connectingTimersRef.current.get(remoteId);
    if (connectingTimer) {
      window.clearTimeout(connectingTimer);
      connectingTimersRef.current.delete(remoteId);
    }
  }, []);

  const observePeerField = useCallback(
    (
      remoteId: string,
      field:
        | "connectionState"
        | "iceConnectionState"
        | "signalingState"
        | "iceGatheringState"
        | "remoteTracksCount"
        | "hasRemoteStream",
      next: string | number | boolean | null,
      pc?: RTCPeerConnection | null
    ) => {
      const prevSnapshot = peerSnapshotRef.current.get(remoteId) ?? {};
      const previous = (prevSnapshot as Record<string, unknown>)[field] ?? null;

      if (previous === next) return;

      peerSnapshotRef.current.set(remoteId, {
        ...prevSnapshot,
        [field]: next as never,
      });

      logPeerStateChange({
        sessionId,
        localDeviceId: deviceId,
        remoteDeviceId: remoteId,
        field,
        previous: previous as string | number | boolean | null,
        next,
        pc,
        media: getPeerMedia(remoteId),
      });
    },
    [deviceId, getPeerMedia, sessionId]
  );

  const syncPeerObservedStates = useCallback(
    (remoteId: string, pc: RTCPeerConnection) => {
      observePeerField(remoteId, "connectionState", pc.connectionState, pc);
      observePeerField(
        remoteId,
        "iceConnectionState",
        pc.iceConnectionState,
        pc
      );
      observePeerField(remoteId, "signalingState", pc.signalingState, pc);
      observePeerField(
        remoteId,
        "iceGatheringState",
        pc.iceGatheringState,
        pc
      );

      const media = getPeerMedia(remoteId);
      observePeerField(
        remoteId,
        "remoteTracksCount",
        media.remoteTracksCount,
        pc
      );
      observePeerField(remoteId, "hasRemoteStream", media.hasRemoteStream, pc);
    },
    [getPeerMedia, observePeerField]
  );

  const markRecoveryStart = useCallback((remoteId: string) => {
    if (!recoveryStartedAtRef.current.has(remoteId)) {
      recoveryStartedAtRef.current.set(remoteId, Date.now());
    }
  }, []);

  const getReconnectBlockReason = useCallback((remoteId: string) => {
    if (
      reconnectPendingRef.current.has(remoteId) ||
      reconnectTimersRef.current.has(remoteId)
    ) {
      return "reconnect_already_scheduled";
    }

    const lastActionAt = lastHealActionAtRef.current.get(remoteId);
    if (lastActionAt && Date.now() - lastActionAt < HEAL_PEER_COOLDOWN_MS) {
      return "heal_cooldown";
    }

    return null;
  }, []);

  const finalizeRecovery = useCallback(
    (
      remoteId: string,
      pc: RTCPeerConnection | null | undefined,
      recoveryVia: "connected" | "ontrack" | "unmute",
      elapsedMsSinceTrackEnded?: number
    ) => {
      const media = getPeerMedia(remoteId);
      if (media.remoteTracksCount <= 0 && recoveryVia !== "connected") {
        return;
      }

      const recoveryStartedAt = recoveryStartedAtRef.current.get(remoteId);
      const elapsedMs =
        recoveryStartedAt != null
          ? Date.now() - recoveryStartedAt
          : elapsedMsSinceTrackEnded ?? 0;

      if (elapsedMs <= 0 && elapsedMsSinceTrackEnded == null) {
        return;
      }

      trackEndedAtRef.current.delete(remoteId);
      recoveryStartedAtRef.current.delete(remoteId);
      reconnectPendingRef.current.delete(remoteId);

      const reconnectTimer = reconnectTimersRef.current.get(remoteId);
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimersRef.current.delete(remoteId);
      }

      logHealRecoverySuccess({
        sessionId,
        localDeviceId: deviceId,
        remoteDeviceId: remoteId,
        connectionState: pc?.connectionState ?? "connected",
        iceConnectionState: pc?.iceConnectionState ?? "connected",
        remoteTracksCount: media.remoteTracksCount,
        elapsedMs,
        recoveryVia,
        ...(elapsedMsSinceTrackEnded != null
          ? { elapsedMsSinceTrackEnded }
          : {}),
      });
    },
    [deviceId, getPeerMedia, sessionId]
  );

  const maybeLogRecoverySuccess = useCallback(
    (remoteId: string, pc: RTCPeerConnection) => {
      const hasRecoveryContext =
        peerEverConnectedRef.current.has(remoteId) ||
        trackEndedAtRef.current.has(remoteId) ||
        recoveryStartedAtRef.current.has(remoteId);

      if (!hasRecoveryContext) return;

      const trackEndedAt = trackEndedAtRef.current.get(remoteId);
      finalizeRecovery(
        remoteId,
        pc,
        "connected",
        trackEndedAt != null ? Date.now() - trackEndedAt : undefined
      );
    },
    [finalizeRecovery]
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

  const touchPeerSignal = useCallback(
    (
      remoteId: string,
      event:
        | "offer_sent"
        | "offer_received"
        | "answer_sent"
        | "answer_received"
        | "ice_sent"
        | "ice_received"
        | "ontrack"
        | "unmute"
    ) => {
      const prev =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      const now = Date.now();

      const next: PeerSignalTimestamps = { ...prev };

      if (event === "offer_sent" || event === "offer_received") {
        next.lastOfferAt = now;
      }
      if (event === "answer_sent" || event === "answer_received") {
        next.lastAnswerAt = now;
      }
      if (event === "ice_sent" || event === "ice_received") {
        next.lastIceCandidateAt = now;
      }
      if (event === "ontrack") {
        next.lastOnTrackAt = now;
      }
      if (event === "unmute") {
        next.lastUnmuteAt = now;
      }

      peerSignalTimestampsRef.current.set(remoteId, next);
    },
    []
  );

  const setPeerMeta = useCallback(
    (
      remoteId: string,
      patch: Partial<Pick<PeerMeta, "lastWarning" | "lastHealAction">>
    ) => {
      const prev = peerMetaRef.current.get(remoteId) ?? {
        lastWarning: null,
        lastHealAction: null,
      };
      peerMetaRef.current.set(remoteId, { ...prev, ...patch });
    },
    []
  );

  const buildMeshPeerSummary = useCallback(
    (remoteId: string): VoiceMeshPeerSummaryEntry => {
      const member = members.find((m) => m.device_id === remoteId);
      const pc = pcsRef.current.get(remoteId) ?? null;
      const media = getPeerMedia(remoteId);
      const stream = remoteStreamsRef.current.get(remoteId);
      const audioTrack = stream?.getAudioTracks()[0] ?? null;
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      const meta = peerMetaRef.current.get(remoteId) ?? {
        lastWarning: null,
        lastHealAction: null,
      };
      const connectStartedAt = connectStartedAtRef.current.get(remoteId) ?? null;
      const msSinceConnectStart =
        connectStartedAt != null ? Date.now() - connectStartedAt : null;
      const hasLocalTrack = pc
        ? pc
            .getSenders()
            .some((sender) => sender.track?.kind === "audio" && !!sender.track)
        : false;

      return {
        remoteDeviceId: remoteId,
        memberExists: !!member,
        isInCall: member ? member.is_in_call === true : null,
        isOfferOwner: deviceId < remoteId,
        pcExists: !!pc,
        signalingState: pc?.signalingState ?? null,
        connectionState: pc?.connectionState ?? null,
        iceConnectionState: pc?.iceConnectionState ?? null,
        iceGatheringState: pc?.iceGatheringState ?? null,
        hasLocalTrack,
        hasRemoteStream: media.hasRemoteStream,
        remoteTracksCount: media.remoteTracksCount,
        remoteAudioTrackReadyState: audioTrack?.readyState ?? null,
        remoteAudioTrackMuted: audioTrack?.muted ?? null,
        weOffered: offeredPeersRef.current.has(remoteId),
        reconnectPending:
          reconnectPendingRef.current.has(remoteId) ||
          reconnectTimersRef.current.has(remoteId),
        reconnectBlockReason: getReconnectBlockReason(remoteId),
        pendingIceCount: pendingIceRef.current.get(remoteId)?.length ?? 0,
        connectStartedAt,
        msSinceConnectStart,
        lastOfferAt: timestamps.lastOfferAt,
        lastAnswerAt: timestamps.lastAnswerAt,
        lastIceCandidateAt: timestamps.lastIceCandidateAt,
        lastOnTrackAt: timestamps.lastOnTrackAt,
        lastUnmuteAt: timestamps.lastUnmuteAt,
        lastWarning: meta.lastWarning,
        lastHealAction: meta.lastHealAction,
      };
    },
    [deviceId, getPeerMedia, getReconnectBlockReason, members]
  );

  const emitMeshSummary = useCallback(
    (trigger: string, opts?: { immediate?: boolean }) => {
      const run = () => {
        const memberDeviceIds = members
          .map((m) => String(m.device_id ?? "").trim())
          .filter(Boolean);
        const inCallMemberDeviceIds = members
          .filter((m) => m.is_in_call === true)
          .map((m) => String(m.device_id ?? "").trim())
          .filter(Boolean);
        const remoteIds = getRemoteIds();
        const peerIds = Array.from(
          new Set([...remoteIds, ...Array.from(pcsRef.current.keys())])
        );

        const peers = peerIds.map((remoteId) => buildMeshPeerSummary(remoteId));
        const summary = {
          trigger,
          sessionId,
          localDeviceId: deviceId,
          memberDeviceIds,
          inCallMemberDeviceIds,
          peers,
        };

        logVoiceMeshPeerSummary(summary);
        checkVoiceMeshExpectations(summary);
      };

      if (opts?.immediate) {
        if (meshSummaryTimerRef.current) {
          window.clearTimeout(meshSummaryTimerRef.current);
          meshSummaryTimerRef.current = null;
        }
        run();
        return;
      }

      if (meshSummaryTimerRef.current) {
        window.clearTimeout(meshSummaryTimerRef.current);
      }

      meshSummaryTimerRef.current = window.setTimeout(() => {
        meshSummaryTimerRef.current = null;
        run();
      }, MESH_SUMMARY_DEBOUNCE_MS);
    },
    [buildMeshPeerSummary, deviceId, getRemoteIds, members, sessionId]
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

  useEffect(() => {
    setPeerStateRef.current = setPeerState;
  }, [setPeerState]);

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
    (
      remoteId: string,
      stream: MediaStream,
      opts?: { reason?: string; force?: boolean }
    ) => {
      remoteStreamsRef.current.set(remoteId, stream);

      for (const track of stream.getAudioTracks()) {
        attachRemoteTrackDiagnosticsRef.current(remoteId, track);
      }

      setRemoteAudios((prev) => {
        const prevState = prev[remoteId];
        const member = members.find((m) => m.device_id === remoteId);
        const prevTrackId = prevState?.stream.getAudioTracks()[0]?.id ?? null;
        const nextTrackId = stream.getAudioTracks()[0]?.id ?? null;

        if (
          !opts?.force &&
          prevState?.stream === stream &&
          prevTrackId === nextTrackId
        ) {
          return {
            ...prev,
            [remoteId]: {
              ...prevState,
              member,
            },
          };
        }

        voiceDebugLog("[voice-peer] upsertRemoteAudio", {
          remoteId,
          reason: opts?.reason ?? "ontrack",
          trackId: nextTrackId,
          trackReadyState: stream.getAudioTracks()[0]?.readyState ?? null,
          attachSeq: Date.now(),
        });

        return {
          ...prev,
          [remoteId]: {
            stream,
            member,
            attachSeq: Date.now(),
          },
        };
      });

      touchPeerSignal(remoteId, "ontrack");
      emitMeshSummary("ontrack", { immediate: true });

      const pc = pcsRef.current.get(remoteId);
      if (pc) {
        syncPeerObservedStates(remoteId, pc);
      }
    },
    [members, syncPeerObservedStates, touchPeerSignal, emitMeshSummary]
  );

  const syncRemoteAudioFromPc = useCallback(
    (remoteId: string, pc: RTCPeerConnection, reason: string) => {
      const liveTrack = pc
        .getReceivers()
        .map((receiver) => receiver.track)
        .find(
          (track): track is MediaStreamTrack =>
            !!track &&
            track.kind === "audio" &&
            track.readyState === "live"
        );

      if (!liveTrack) {
        voiceDebugLog("[voice-peer] syncRemoteAudio skip", {
          remoteId,
          reason,
          receiverCount: pc.getReceivers().length,
        });
        return false;
      }

      const prevStream = remoteStreamsRef.current.get(remoteId);
      const prevTrack = prevStream?.getAudioTracks()[0];
      if (
        prevTrack?.id === liveTrack.id &&
        prevTrack.readyState === "live" &&
        !prevTrack.muted
      ) {
        return false;
      }

      upsertRemoteAudio(remoteId, new MediaStream([liveTrack]), {
        reason: `sync:${reason}`,
        force: true,
      });
      return true;
    },
    [upsertRemoteAudio]
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
    (
      remoteId: string,
      opts?: {
        clearConnectionId?: boolean;
        preserveRemoteAudio?: boolean;
        reason?: string;
      }
    ) => {
      const shouldClearConnectionId = opts?.clearConnectionId ?? false;
      const preserveRemoteAudio = opts?.preserveRemoteAudio === true;
      const reason = opts?.reason ?? "unspecified";
      const pc = pcsRef.current.get(remoteId);
      const hadPc = !!pc;

      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.oniceconnectionstatechange = null;
          pc.onsignalingstatechange = null;
          pc.onicegatheringstatechange = null;
          pc.close();
        } catch {}
      }

      pcsRef.current.delete(remoteId);
      offeredPeersRef.current.delete(remoteId);
      startedPeersRef.current.delete(remoteId);
      if (!preserveRemoteAudio) {
        remoteStreamsRef.current.delete(remoteId);
      }
      pendingIceRef.current.delete(remoteId);
      clearReconnectTimer(remoteId);
      clearPeerWatchdogTimers(remoteId);

      connectStartedAtRef.current.delete(remoteId);
      peerSnapshotRef.current.delete(remoteId);
      attachedTrackIdsRef.current.delete(remoteId);
      trackEndedAtRef.current.delete(remoteId);
      reconnectPendingRef.current.delete(remoteId);
      lastHealActionAtRef.current.delete(remoteId);
      peerSignalTimestampsRef.current.delete(remoteId);
      peerMetaRef.current.delete(remoteId);

      peerStatesRef.current.delete(remoteId);
      emitPeerStates();

      const compact =
        `[voice-peer] close remote=${compactDeviceId(remoteId)} reason=${reason} ` +
        `hadPc=${hadPc} preserveAudio=${preserveRemoteAudio} clearConnId=${shouldClearConnectionId}`;

      console.log(compact);
      recordCallReloadContext({ lastClosePeer: compact });

      if (shouldClearConnectionId) {
        clearCurrentConnectionId(remoteId);
      }

      if (!preserveRemoteAudio) {
        setRemoteAudios((prev) => {
          const next = { ...prev };
          delete next[remoteId];
          return next;
        });
      }
    },
    [clearPeerWatchdogTimers, clearReconnectTimer, clearCurrentConnectionId, emitPeerStates]
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
    (
      remoteId: string,
      delay = 2000,
      opts?: { reason?: string; force?: boolean }
    ): boolean => {
      if (!localAudioTrackRef.current && !localStreamRef.current) return false;

      const reason = opts?.reason ?? "unspecified";

      if (!opts?.force && reconnectPendingRef.current.has(remoteId)) {
        voiceDebugLog("[voice-peer] reconnect-deduped", {
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          reason,
          existingReason: reconnectPendingRef.current.get(remoteId)?.reason,
          existingScheduledInMs: reconnectPendingRef.current.get(remoteId)
            ?.scheduledInMs,
        });
        return false;
      }

      clearReconnectTimer(remoteId);
      markRecoveryStart(remoteId);
      lastHealActionAtRef.current.set(remoteId, Date.now());

      reconnectPendingRef.current.set(remoteId, {
        reason,
        scheduledInMs: delay,
        scheduledAt: Date.now(),
      });

      const timer = window.setTimeout(() => {
        reconnectTimersRef.current.delete(remoteId);
        reconnectPendingRef.current.delete(remoteId);

        const nextConnectionId = makeConnectionId(deviceId, remoteId);
        closePeer(remoteId, {
          clearConnectionId: false,
          preserveRemoteAudio: true,
          reason: reason,
        });
        setCurrentConnectionId(remoteId, nextConnectionId);
        connectStartedAtRef.current.set(remoteId, Date.now());

        if (deviceId < remoteId) {
          void maybeStartOfferRef.current?.(remoteId);
        } else {
          createPeerConnectionRef.current?.(remoteId, nextConnectionId);
          setPeerStateRef.current(remoteId, "connecting");
        }
      }, delay);

      reconnectTimersRef.current.set(remoteId, timer);
      return true;
    },
    [
      clearReconnectTimer,
      closePeer,
      deviceId,
      localAudioTrackRef,
      localStreamRef,
      markRecoveryStart,
      setCurrentConnectionId,
    ]
  );

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  const attachRemoteTrackDiagnostics = useCallback(
    (remoteId: string, track: MediaStreamTrack) => {
      const trackKey = track.id || `${remoteId}:${track.kind}`;
      const attached =
        attachedTrackIdsRef.current.get(remoteId) ?? new Set<string>();

      if (attached.has(trackKey)) return;

      attached.add(trackKey);
      attachedTrackIdsRef.current.set(remoteId, attached);

      const emitTrackEvent = (
        event: "ontrack" | "mute" | "unmute" | "ended",
        extra?: {
          elapsedMsSinceTrackEnded?: number;
          scheduledReconnectInMs?: number;
          reconnectScheduled?: boolean;
        }
      ) => {
        logRemoteTrackEvent({
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          event,
          trackKind: track.kind,
          trackId: track.id,
          ...extra,
        });
      };

      const maybeLogTrackRecovery = (
        event: "ontrack" | "unmute",
        elapsedMsSinceTrackEnded?: number
      ) => {
        if (elapsedMsSinceTrackEnded == null) return;

        const pc = pcsRef.current.get(remoteId);
        finalizeRecovery(remoteId, pc, event, elapsedMsSinceTrackEnded);
      };

      const endedAtOnAttach = trackEndedAtRef.current.get(remoteId);
      const elapsedOnAttach =
        endedAtOnAttach != null ? Date.now() - endedAtOnAttach : undefined;
      emitTrackEvent("ontrack", { elapsedMsSinceTrackEnded: elapsedOnAttach });
      maybeLogTrackRecovery("ontrack", elapsedOnAttach);

      track.onmute = () => {
        const endedAt = trackEndedAtRef.current.get(remoteId);
        const elapsedMsSinceTrackEnded =
          endedAt != null ? Date.now() - endedAt : undefined;
        emitTrackEvent("mute", { elapsedMsSinceTrackEnded });
      };

      track.onunmute = () => {
        const endedAt = trackEndedAtRef.current.get(remoteId);
        const elapsedMsSinceTrackEnded =
          endedAt != null ? Date.now() - endedAt : undefined;
        emitTrackEvent("unmute", { elapsedMsSinceTrackEnded });
        touchPeerSignal(remoteId, "unmute");
        emitMeshSummary("unmute", { immediate: true });
        maybeLogTrackRecovery("unmute", elapsedMsSinceTrackEnded);

        const pc = pcsRef.current.get(remoteId);
        if (pc) {
          syncRemoteAudioFromPc(remoteId, pc, "track_unmute");
        }
      };

      track.onended = () => {
        trackEndedAtRef.current.set(remoteId, Date.now());
        markRecoveryStart(remoteId);

        const pc = pcsRef.current.get(remoteId);
        if (pc) {
          observePeerField(
            remoteId,
            "remoteTracksCount",
            pc.getReceivers().filter((r) => r.track?.readyState === "live").length,
            pc
          );
        }

        if (peerEverConnectedRef.current.has(remoteId)) {
          setPeerStateRef.current(remoteId, "connecting");
        }

        const reconnectScheduled = Boolean(
          scheduleReconnectRef.current?.(remoteId, TRACK_ENDED_RECONNECT_MS, {
            reason: "remote_track_ended",
          })
        );

        emitTrackEvent("ended", {
          scheduledReconnectInMs: TRACK_ENDED_RECONNECT_MS,
          reconnectScheduled,
        });
      };
    },
    [deviceId, emitMeshSummary, finalizeRecovery, markRecoveryStart, observePeerField, sessionId, syncRemoteAudioFromPc, touchPeerSignal]
  );

  useEffect(() => {
    attachRemoteTrackDiagnosticsRef.current = attachRemoteTrackDiagnostics;
  }, [attachRemoteTrackDiagnostics]);

  const scheduleIceCheckingTimeout = useCallback(
    (remoteId: string, connectionId: string, pc: RTCPeerConnection) => {
      const existing = iceCheckingTimersRef.current.get(remoteId);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        iceCheckingTimersRef.current.delete(remoteId);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        const currentPc = pcsRef.current.get(remoteId);
        if (!currentPc || currentPc !== pc) return;

        if (currentPc.iceConnectionState !== "checking") return;

        logPeerStateWarning({
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          reason: "checking_timeout",
          pc: currentPc,
          media: getPeerMedia(remoteId),
        });
        setPeerMeta(remoteId, { lastWarning: "checking_timeout" });
        emitMeshSummary("checking_timeout", { immediate: true });

        markRecoveryStart(remoteId);
        scheduleReconnectRef.current?.(remoteId, 1200);
      }, 10000);

      iceCheckingTimersRef.current.set(remoteId, timer);
    },
    [deviceId, emitMeshSummary, getCurrentConnectionId, getPeerMedia, markRecoveryStart, sessionId, setPeerMeta]
  );

  const scheduleConnectingTimeout = useCallback(
    (remoteId: string, connectionId: string, pc: RTCPeerConnection) => {
      const existing = connectingTimersRef.current.get(remoteId);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        connectingTimersRef.current.delete(remoteId);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        const currentPc = pcsRef.current.get(remoteId);
        if (!currentPc || currentPc !== pc) return;

        if (currentPc.connectionState !== "connecting") return;

        logPeerStateWarning({
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          reason: "connecting_timeout",
          pc: currentPc,
          media: getPeerMedia(remoteId),
        });
        setPeerMeta(remoteId, { lastWarning: "connecting_timeout" });
        emitMeshSummary("connecting_timeout", { immediate: true });

        markRecoveryStart(remoteId);
        scheduleReconnectRef.current?.(remoteId, 1200);
      }, 12000);

      connectingTimersRef.current.set(remoteId, timer);
    },
    [deviceId, getCurrentConnectionId, getPeerMedia, markRecoveryStart, sessionId, setPeerMeta, emitMeshSummary]
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
        closePeer(remoteId, CLOSE_FOR_RECONNECT);
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
        touchPeerSignal(remoteId, "ice_sent");
        emitMeshSummary("ice_sent");
      };

      pc.ontrack = (event) => {
        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        const stream = event.streams?.[0];
        if (!stream) return;

        upsertRemoteAudio(remoteId, stream, { reason: "pc_ontrack", force: true });
        touchPeerSignal(remoteId, "ontrack");
        emitMeshSummary("pc_ontrack", { immediate: true });

        window.setTimeout(() => {
          syncRemoteAudioFromPc(remoteId, pc, "ontrack_delayed");
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

      pc.onicegatheringstatechange = () => {
        syncPeerObservedStates(remoteId, pc);
      };

      pc.onsignalingstatechange = () => {
        syncPeerObservedStates(remoteId, pc);
      };

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        syncPeerObservedStates(remoteId, pc);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        if (iceState === "checking") {
          scheduleIceCheckingTimeout(remoteId, connectionId, pc);
        } else {
          const checkingTimer = iceCheckingTimersRef.current.get(remoteId);
          if (checkingTimer) {
            window.clearTimeout(checkingTimer);
            iceCheckingTimersRef.current.delete(remoteId);
          }
        }

        if (iceState === "disconnected") {
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "disconnected",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "connecting");
          scheduleReconnect(remoteId, 1200);
        }

        if (iceState === "failed") {
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "failed",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "failed");
          void logVoiceConnection(remoteId, pc, "failed");

          if (
            voiceRouteRef.current === "stun" &&
            turnFallbackEnabledRef.current
          ) {
            void enableTurnFallback().then((ok) => {
              if (!ok) {
                scheduleReconnect(remoteId, 1200);
                return;
              }

              const nextConnectionId = makeConnectionId(deviceId, remoteId);
              closePeer(remoteId, CLOSE_FOR_RECONNECT);
              setCurrentConnectionId(remoteId, nextConnectionId);
              connectStartedAtRef.current.set(remoteId, Date.now());
              scheduleReconnect(remoteId, 300);
            });

            return;
          }

          scheduleReconnect(remoteId, 1200);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        syncPeerObservedStates(remoteId, pc);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        if (state === "connecting") {
          setPeerState(remoteId, "connecting");
          scheduleConnectingTimeout(remoteId, connectionId, pc);

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
                closePeer(remoteId, CLOSE_FOR_RECONNECT);
                setCurrentConnectionId(remoteId, nextConnectionId);
                connectStartedAtRef.current.set(remoteId, Date.now());
                scheduleReconnect(remoteId, 300);
              });
            }, 5000);
          }
        } else {
          const connectingTimer = connectingTimersRef.current.get(remoteId);
          if (connectingTimer) {
            window.clearTimeout(connectingTimer);
            connectingTimersRef.current.delete(remoteId);
          }
        }

        if (state === "connected") {
          peerEverConnectedRef.current.add(remoteId);
          setPeerState(remoteId, "connected");
          clearReconnectTimer(remoteId);
          clearPeerWatchdogTimers(remoteId);
          maybeLogRecoverySuccess(remoteId, pc);
          syncRemoteAudioFromPc(remoteId, pc, "pc_connected");

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
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "disconnected",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "connecting");
          scheduleReconnect(remoteId, 1200);
        }

        if (state === "failed") {
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "failed",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "failed");
          void logVoiceConnection(remoteId, pc, "failed");

          if (
            voiceRouteRef.current === "stun" &&
            turnFallbackEnabledRef.current
          ) {
            void enableTurnFallback().then((ok) => {
              if (!ok) {
                closePeer(remoteId, CLOSE_FOR_RECONNECT);
                scheduleReconnect(remoteId, 1200);
                return;
              }

              const nextConnectionId = makeConnectionId(deviceId, remoteId);
              closePeer(remoteId, CLOSE_FOR_RECONNECT);
              setCurrentConnectionId(remoteId, nextConnectionId);
              connectStartedAtRef.current.set(remoteId, Date.now());
              scheduleReconnect(remoteId, 300);
            });

            return;
          }

          closePeer(remoteId, CLOSE_FOR_RECONNECT);
          scheduleReconnect(remoteId, 1200);
        }

        if (state === "closed") {
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "closed",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "idle");
        }
      };

      syncPeerObservedStates(remoteId, pc);

      pcsRef.current.set(remoteId, pc);
      return pc;
    },
    [
      clearPeerWatchdogTimers,
      clearReconnectTimer,
      closePeer,
      deviceId,
      enableTurnFallback,
      getCurrentConnectionId,
      getPeerMedia,
      isMuted,
      localAudioTrackRef,
      localStreamRef,
      logVoiceConnection,
      markConnectStart,
      maybeLogRecoverySuccess,
      scheduleConnectingTimeout,
      scheduleIceCheckingTimeout,
      scheduleReconnect,
      sendSignal,
      sessionId,
      setCurrentConnectionId,
      setPeerState,
      syncPeerObservedStates,
      syncRemoteAudioFromPc,
      touchPeerSignal,
      emitMeshSummary,
      upsertRemoteAudio,
    ]
  );

  const maybeStartOffer = useCallback(
    async (remoteId: string) => {
      const isOfferOwner = deviceId < remoteId;
      if (!isOfferOwner) return;

      if (!localAudioTrackRef.current && !localStreamRef.current) return;

      const hasRemoteStream = hasLiveRemoteStream(remoteId);
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
        touchPeerSignal(remoteId, "offer_sent");
        emitMeshSummary("offer_sent", { immediate: true });
      } catch (e) {
        offeredPeersRef.current.delete(remoteId);
        console.error("[call] create offer error", remoteId, connectionId, e);
      }
    },
    [
      clearReconnectTimer,
      createPeerConnection,
      deviceId,
      emitMeshSummary,
      getCurrentConnectionId,
      hasLiveRemoteStream,
      localAudioTrackRef,
      localStreamRef,
      markConnectStart,
      sendSignal,
      setCurrentConnectionId,
      setPeerState,
      touchPeerSignal,
    ]
  );

  useEffect(() => {
    maybeStartOfferRef.current = maybeStartOffer;
  }, [maybeStartOffer]);

  const ensurePeerConnection = useCallback(
    (remoteId: string, reason: string): boolean => {
      if (!localAudioTrackRef.current && !localStreamRef.current) return false;

      const existing = pcsRef.current.get(remoteId);
      if (
        existing &&
        existing.connectionState !== "closed" &&
        existing.connectionState !== "failed"
      ) {
        return true;
      }

      let connectionId = getCurrentConnectionId(remoteId);
      if (!connectionId) {
        connectionId = makeConnectionId(deviceId, remoteId);
        setCurrentConnectionId(remoteId, connectionId);
      }

      markConnectStart(remoteId);
      lastHealActionAtRef.current.set(remoteId, Date.now());
      reconnectPendingRef.current.delete(remoteId);
      clearReconnectTimer(remoteId);

      if (deviceId < remoteId) {
        offeredPeersRef.current.delete(remoteId);
        void maybeStartOffer(remoteId);
      } else {
        createPeerConnection(remoteId, connectionId);
        setPeerState(remoteId, "connecting");
      }

      voiceDebugLog("[voice-peer] ensurePeerConnection", {
        sessionId,
        localDeviceId: deviceId,
        remoteDeviceId: remoteId,
        reason,
        isOfferOwner: deviceId < remoteId,
      });

      return true;
    },
    [
      clearReconnectTimer,
      createPeerConnection,
      deviceId,
      getCurrentConnectionId,
      localAudioTrackRef,
      localStreamRef,
      markConnectStart,
      maybeStartOffer,
      sessionId,
      setCurrentConnectionId,
      setPeerState,
    ]
  );

  useEffect(() => {
    ensurePeerConnectionRef.current = ensurePeerConnection;
  }, [ensurePeerConnection]);

  useEffect(() => {
    createPeerConnectionRef.current = createPeerConnection;
  }, [createPeerConnection]);

  const logHealPeerAction = useCallback(
    (
      remoteId: string,
      action:
        | "create"
        | "reconnect"
        | "close-extra"
        | "retry-offer"
        | "skip"
        | "deduped",
      reason: string,
      pc: RTCPeerConnection | null | undefined,
      opts?: {
        hasRemoteStream?: boolean;
        healRun?: number;
        scheduledInMs?: number;
      }
    ) => {
      if (action === "skip") {
        voiceDebugLog("[voice-peer] healRun", {
          healRun: opts?.healRun ?? healRunSeqRef.current,
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          action,
          reason,
          ...(opts?.scheduledInMs != null
            ? { scheduledInMs: opts.scheduledInMs }
            : {}),
        });
        return;
      }

      setPeerMeta(remoteId, {
        lastHealAction:
          action === "deduped"
            ? `deduped:${reason}`
            : `${action}:${reason}`,
      });

      const prev = peerHealActionRef.current.get(remoteId);
      const consecutive =
        prev?.lastAction === action ? prev.consecutive + 1 : 1;

      if (action !== "deduped") {
        peerHealActionRef.current.set(remoteId, {
          lastAction: action,
          consecutive,
        });
      }

      const media = {
        hasRemoteStream:
          opts?.hasRemoteStream ?? remoteStreamsRef.current.has(remoteId),
        remoteTracksCount:
          remoteStreamsRef.current.get(remoteId)?.getAudioTracks().length ?? 0,
      };

      const pending = reconnectPendingRef.current.get(remoteId);

      emitHealPeerAction({
        sessionId,
        localDeviceId: deviceId,
        remoteDeviceId: remoteId,
        healRun: opts?.healRun ?? healRunSeqRef.current,
        action,
        reason,
        pc,
        media,
        scheduledInMs:
          opts?.scheduledInMs ?? pending?.scheduledInMs ?? undefined,
        repeatWarning:
          consecutive >= 3 &&
          (action === "reconnect" || action === "retry-offer"),
      });
    },
    [deviceId, sessionId, setPeerMeta]
  );

  const isRemoteInCall = useCallback(
    (remoteId: string) => {
      const member = members.find((m) => m.device_id === remoteId);
      return member?.is_in_call === true;
    },
    [members]
  );

  const healPeerConnections = useCallback(() => {
    if (!micReady || !signalReady) return;

    const remoteIds = getRemoteIds();

    type PlannedHeal = {
      remoteId: string;
      action:
        | "create"
        | "reconnect"
        | "close-extra"
        | "retry-offer"
        | "deduped";
      reason: string;
      scheduledInMs?: number;
      run?: () => void;
    };

    const planned: PlannedHeal[] = [];

    for (const existingId of Array.from(pcsRef.current.keys())) {
      if (!remoteIds.includes(existingId)) {
        planned.push({
          remoteId: existingId,
          action: "close-extra",
          reason: "member_left",
          run: () => closePeer(existingId, { clearConnectionId: true, reason: "member_left" }),
        });
      }
    }

    for (const remoteId of remoteIds) {
      const pc = pcsRef.current.get(remoteId);
      const hasStream = hasLiveRemoteStream(remoteId);
      const connected = pc?.connectionState === "connected";
      const blockReason = getReconnectBlockReason(remoteId);
      const inCall = isRemoteInCall(remoteId);

      if (hasStream && connected) {
        setPeerState(remoteId, "connected");
        continue;
      }

      if (!pc && inCall) {
        planned.push({
          remoteId,
          action: "create",
          reason: "missing_pc_in_call",
          run: () => {
            reconnectPendingRef.current.delete(remoteId);
            clearReconnectTimer(remoteId);
            ensurePeerConnectionRef.current?.(remoteId, "heal_missing_pc_in_call");
          },
        });
        continue;
      }

      if (blockReason && pc) {
        planned.push({
          remoteId,
          action: "deduped",
          reason: blockReason,
          scheduledInMs: reconnectPendingRef.current.get(remoteId)?.scheduledInMs,
        });
        continue;
      }

      if (trackEndedAtRef.current.has(remoteId) && !hasStream) {
        planned.push({
          remoteId,
          action: "reconnect",
          reason: "remote_track_ended",
          scheduledInMs: TRACK_ENDED_RECONNECT_MS,
          run: () => {
            scheduleReconnect(remoteId, TRACK_ENDED_RECONNECT_MS, {
              reason: "heal_remote_track_ended",
            });
          },
        });
        continue;
      }

      if (
        hasStream &&
        pc &&
        (pc.connectionState === "disconnected" ||
          pc.iceConnectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.iceConnectionState === "failed" ||
          pc.connectionState === "connecting")
      ) {
        planned.push({
          remoteId,
          action: "reconnect",
          reason: "stream_without_connected_pc",
          scheduledInMs: TRACK_ENDED_RECONNECT_MS,
          run: () => {
            scheduleReconnect(remoteId, TRACK_ENDED_RECONNECT_MS, {
              reason: "heal_stream_without_connected_pc",
            });
          },
        });
        continue;
      }

      const failed =
        !pc ||
        pc.connectionState === "failed" ||
        pc.iceConnectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected" ||
        pc.iceConnectionState === "disconnected";

      if (failed) {
        planned.push({
          remoteId,
          action: pc ? "reconnect" : "create",
          reason: pc ? "pc_failed_or_closed" : "missing_pc",
          scheduledInMs: pc ? TRACK_ENDED_RECONNECT_MS : undefined,
          run: () => {
            if (!pc) {
              reconnectPendingRef.current.delete(remoteId);
              clearReconnectTimer(remoteId);
              ensurePeerConnectionRef.current?.(remoteId, "heal_missing_pc");
              return;
            }
            scheduleReconnect(remoteId, TRACK_ENDED_RECONNECT_MS, {
              reason: "heal_pc_failed_or_closed",
            });
          },
        });
        continue;
      }

      const stuckOffer =
        offeredPeersRef.current.has(remoteId) &&
        !hasStream &&
        pc.signalingState === "have-local-offer";

      if (stuckOffer) {
        const startedAt = connectStartedAtRef.current.get(remoteId) ?? Date.now();
        if (Date.now() - startedAt > 6000) {
          planned.push({
            remoteId,
            action: "retry-offer",
            reason: "stuck_have_local_offer",
            scheduledInMs: TRACK_ENDED_RECONNECT_MS,
            run: () => {
              offeredPeersRef.current.delete(remoteId);
              scheduleReconnect(remoteId, TRACK_ENDED_RECONNECT_MS, {
                reason: "heal_stuck_have_local_offer",
              });
            },
          });
        }
        continue;
      }

      if (!hasStream && !offeredPeersRef.current.has(remoteId)) {
        planned.push({
          remoteId,
          action: pc ? "retry-offer" : "create",
          reason: "no_stream_no_offer",
          run: () => {
            if (!getCurrentConnectionId(remoteId)) {
              setCurrentConnectionId(
                remoteId,
                makeConnectionId(deviceId, remoteId)
              );
            }
            markConnectStart(remoteId);
            lastHealActionAtRef.current.set(remoteId, Date.now());
            void maybeStartOffer(remoteId);
          },
        });
      }
    }

    const actionable = planned.filter((item) => item.action !== "deduped");
    if (actionable.length === 0) {
      if (planned.length > 0) {
        voiceDebugLog("[voice-peer] heal-all-deduped", {
          sessionId,
          deviceId,
          remoteDeviceIds: remoteIds,
          reasons: planned.map((item) => ({
            remoteDeviceId: item.remoteId,
            reason: item.reason,
            scheduledInMs: item.scheduledInMs,
          })),
        });
      }
      return;
    }

    healRunSeqRef.current += 1;
    const healRun = healRunSeqRef.current;

    for (const item of planned) {
      if (item.action === "deduped") continue;

      logHealPeerAction(
        item.remoteId,
        item.action,
        item.reason,
        pcsRef.current.get(item.remoteId),
        {
          healRun,
          hasRemoteStream: remoteStreamsRef.current.has(item.remoteId),
          scheduledInMs: item.scheduledInMs,
        }
      );
      item.run?.();
    }

    for (const item of planned) {
      if (item.action !== "deduped") continue;

      logHealPeerAction(
        item.remoteId,
        item.action,
        item.reason,
        pcsRef.current.get(item.remoteId),
        {
          healRun,
          hasRemoteStream: remoteStreamsRef.current.has(item.remoteId),
          scheduledInMs: item.scheduledInMs,
        }
      );
    }

    emitPeerStates();

    voiceDebugLog("[voice-peer] healPeerConnections done", {
      healRun,
      sessionId,
      deviceId,
      remoteDeviceIds: remoteIds,
      peerConnectionCount: pcsRef.current.size,
      actionCount: actionable.length,
    });

    emitMeshSummary("healRun", { immediate: true });
  }, [
    closePeer,
    deviceId,
    emitMeshSummary,
    emitPeerStates,
    getCurrentConnectionId,
    getReconnectBlockReason,
    getRemoteIds,
    hasLiveRemoteStream,
    isRemoteInCall,
    logHealPeerAction,
    markConnectStart,
    maybeStartOffer,
    micReady,
    scheduleReconnect,
    sessionId,
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
        closePeer(remoteId, { clearConnectionId: true, reason: "leave_signal" });
        return;
      }

      if (!incomingConnectionId) return;

      let currentConnectionId = getCurrentConnectionId(remoteId);

      if (row.signal_type === "offer") {
        if (currentConnectionId !== incomingConnectionId) {
          closePeer(remoteId, CLOSE_FOR_RECONNECT);
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
          touchPeerSignal(remoteId, "offer_received");

          setPeerState(remoteId, "connecting");

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await sendSignal(remoteId, "answer", {
            connectionId: incomingConnectionId,
            sdp: pc.localDescription,
          });
          touchPeerSignal(remoteId, "answer_sent");
          emitMeshSummary("answer_sent", { immediate: true });

          return;
        }

        if (row.signal_type === "answer") {
          const sdp = payload.sdp;
          if (!sdp) return;
          if (pc.signalingState !== "have-local-offer") return;

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(remoteId, incomingConnectionId);
          touchPeerSignal(remoteId, "answer_received");
          emitMeshSummary("answer_received", { immediate: true });
          return;
        }

        if (row.signal_type === "ice") {
          const candidate = payload.candidate;
          if (!candidate) return;

          if (!pc.remoteDescription) {
            const queued = pendingIceRef.current.get(remoteId) ?? [];
            queued.push(candidate);
            pendingIceRef.current.set(remoteId, queued);
            touchPeerSignal(remoteId, "ice_received");
            emitMeshSummary("ice_received");
            return;
          }

          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            touchPeerSignal(remoteId, "ice_received");
            emitMeshSummary("ice_received");
          } catch (e) {
            console.warn("[call] addIceCandidate ignored", remoteId, e);
          }
        }
      } catch (e) {
        console.error("[call] signal handle error", row.signal_type, remoteId, e);

        if (row.signal_type === "offer" || row.signal_type === "answer") {
          closePeer(remoteId, CLOSE_FOR_RECONNECT);
          scheduleReconnect(remoteId, 1200);
        }
      }
    },
    [
      closePeer,
      createPeerConnection,
      deviceId,
      emitMeshSummary,
      flushPendingIce,
      getCurrentConnectionId,
      scheduleReconnect,
      sendSignal,
      sessionId,
      setCurrentConnectionId,
      setPeerState,
      touchPeerSignal,
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

    voiceDebugLog("[voice-peer] offer effect check", {
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
      voiceDebugLog("[voice-peer] offer effect stop", { reason: "micReady_false" });
      return;
    }

    if (!signalReady) {
      voiceDebugLog("[voice-peer] offer effect stop", {
        reason: "signalReady_false",
      });
      return;
    }

    if (remoteIds.length < 1) {
      voiceDebugLog("[voice-peer] offer effect stop", { reason: "no_remoteIds" });
      return;
    }

    for (const existingId of Array.from(pcsRef.current.keys())) {
      if (!remoteIds.includes(existingId)) {
        startedPeersRef.current.delete(existingId);
        peerStatesRef.current.delete(existingId);
        emitPeerStates();
        closePeer(existingId, { clearConnectionId: true, reason: "member_removed" });
      }
    }

    for (const remoteId of remoteIds) {
      if (!getCurrentConnectionId(remoteId)) {
        setCurrentConnectionId(remoteId, makeConnectionId(deviceId, remoteId));
      }

      void maybeStartOffer(remoteId);
    }

    healPeerConnections();
    emitMeshSummary("after_join", { immediate: true });
  }, [
    members,
    micReady,
    signalReady,
    deviceId,
    closePeer,
    emitMeshSummary,
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
    emitMeshSummary("members_updated", { immediate: true });
  }, [membersSyncRevision, emitMeshSummary, healPeerConnections]);

  useEffect(() => {
    if (!micReady || !signalReady) return;

    const timer = window.setInterval(() => {
      const remoteIds = getRemoteIds();
      let hasStuckPeer = false;

      for (const remoteId of remoteIds) {
        const pc = pcsRef.current.get(remoteId);
        if (!pc) continue;
        if (pc.connectionState === "connected") continue;

        const startedAt = connectStartedAtRef.current.get(remoteId);
        if (startedAt != null && Date.now() - startedAt >= 10000) {
          hasStuckPeer = true;
          break;
        }
      }

      if (hasStuckPeer) {
        emitMeshSummary("not_connected_10s", { immediate: true });
      }
    }, 10000);

    meshNotConnectedTimerRef.current = timer;

    return () => {
      window.clearInterval(timer);
      meshNotConnectedTimerRef.current = null;
    };
  }, [emitMeshSummary, getRemoteIds, micReady, signalReady]);

  useEffect(() => {
    return () => {
      if (meshSummaryTimerRef.current) {
        window.clearTimeout(meshSummaryTimerRef.current);
      }
      if (meshNotConnectedTimerRef.current) {
        window.clearInterval(meshNotConnectedTimerRef.current);
      }
    };
  }, []);

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
          pc.connectionState === "failed" ||
          pc.iceConnectionState === "failed" ||
          pc.connectionState === "disconnected" ||
          pc.iceConnectionState === "disconnected";

        if (badState) {
          scheduleReconnect(remoteId, 1200);
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