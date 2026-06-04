"use client";

import { debugConsoleLog } from "@/lib/debugVoiceLog";
import { logAppLife } from "@/lib/appLifecycle";
import { useCallback, useEffect, useMemo, useRef } from "react";
import RemoteAudio, {
  type RemotePlaybackHealth,
} from "./voice/RemoteAudio";
import { useLocalMic, releaseSessionMic } from "./voice/useLocalMic";
import { useCallSignaling } from "./voice/useCallSignaling";
import { usePeerConnections } from "./voice/usePeerConnections";
import {
  compactDeviceId,
  type PeerStatusDiagnostics,
} from "./voice/voiceDiagnostics";
import { logVoiceClientEnv, getVoiceMode } from "@/lib/voiceClientEnv";

function compactSessionId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 8) return value;
  return value.slice(-8);
}

function createVoiceLayerInstanceId(): string {
  return Math.random().toString(36).slice(2, 6);
}

type Member = {
  device_id: string;
  display_name: string;
  photo_path?: string | null;
  screen?: string | null;
  last_seen_at?: string | null;
  is_in_call?: boolean;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";

type CallVoiceLayerProps = {
  sessionId: string;
  deviceId: string;
  members: Member[];
  membersSyncRevision?: number;
  userMuted: boolean;
  userMutedRef: React.MutableRefObject<boolean>;
  onMicReadyChange?: (ready: boolean) => void;
  onLocalTrackMutedApplied?: (params: {
    userMuted: boolean;
    trackEnabled: boolean;
    reason: string;
  }) => void;
  onMicLevelChange?: (level: number) => void;
  onRemoteSpeakingChange?: (remoteId: string, level: number) => void;
  onRemotePlaybackHealthChange?: (
    remoteId: string,
    health: RemotePlaybackHealth
  ) => void;
  onRemoteCountChange?: (count: number) => void;
  onStatusChange?: (text: string) => void;
  onPeerStatesChange?: (states: Record<string, PeerState>) => void;
  onPeerDiagnosticsChange?: (
    diagnostics: Record<string, PeerStatusDiagnostics>
  ) => void;
  onVoiceCleanup?: () => void;
  onManualPeerHardResetReady?: (
    reset: (remoteId: string) => void | Promise<void>
  ) => void;
};

export default function CallVoiceLayer({
  sessionId,
  deviceId,
  members,
  membersSyncRevision = 0,
  userMuted,
  userMutedRef,
  onMicReadyChange,
  onMicLevelChange,
  onLocalTrackMutedApplied,
  onRemoteSpeakingChange,
  onRemotePlaybackHealthChange,
  onRemoteCountChange,
  onStatusChange,
  onPeerStatesChange,
  onPeerDiagnosticsChange,
  onVoiceCleanup,
  onManualPeerHardResetReady,
}: CallVoiceLayerProps) {
  const instanceRef = useRef(createVoiceLayerInstanceId());
  const instanceId = instanceRef.current;
  const membersRef = useRef(members);
  membersRef.current = members;

  const applyLocalAudioTrackRef = useRef<
    (track: MediaStreamTrack | null, reason: string) => void
  >(() => {});

  const mic = useLocalMic({
    sessionId,
    deviceId,
    userMuted,
    userMutedRef,
    onMicReadyChange,
    onMicLevelChange,
    onStatusChange,
    onLocalTrackMutedApplied,
    onLocalMicTrackChange: (track, reason) => {
      applyLocalAudioTrackRef.current(track, reason);
    },
  });

  const noopSignal = useMemo(() => {
    return async () => {};
  }, []);

  const signaling = useCallSignaling({
    sessionId,
    deviceId,
    onSignal: noopSignal,
    onStatusChange,
  });

  const peer = usePeerConnections({
    sessionId,
    deviceId,
    members,
    membersSyncRevision,
    userMuted,
    userMutedRef,
    micReady: mic.micInteractionReady,
    signalReady: signaling.signalReady,
    localStreamRef: mic.localStreamRef,
    localAudioTrackRef: mic.localAudioTrackRef,
    sendSignal: signaling.sendSignal,
    onRemoteCountChange,
    onStatusChange,
    onPeerStatesChange,
    onPeerDiagnosticsChange,
    onVoiceCleanup,
  });

  useEffect(() => {
    logAppLife("voice-layer-mount", {
      instance: instanceId,
      session: compactSessionId(sessionId),
      device: compactDeviceId(deviceId),
      members: membersRef.current.length,
    });
    debugConsoleLog(
      `[voice-layer] mount instance=${instanceId} sessionId=${compactSessionId(sessionId)} deviceId=${compactDeviceId(deviceId)} members=${membersRef.current.length}`
    );
    return () => {
      const vis =
        typeof document !== "undefined" ? document.visibilityState : "-";
      logAppLife("voice-layer-unmount", {
        instance: instanceId,
        session: compactSessionId(sessionId),
        device: compactDeviceId(deviceId),
        members: membersRef.current.length,
        vis,
        reason: "component_unmount",
      });
      debugConsoleLog(
        `[voice-layer] unmount instance=${instanceId} sessionId=${compactSessionId(sessionId)} deviceId=${compactDeviceId(deviceId)} members=${membersRef.current.length} vis=${vis} reason=component_unmount`
      );
      releaseSessionMic("voice_layer_unmount", sessionId);
    };
  }, [deviceId, instanceId, sessionId]);

  useEffect(() => {
    logVoiceClientEnv("voice-layer-mount");
  }, []);

  useEffect(() => {
    applyLocalAudioTrackRef.current = peer.applyLocalAudioTrack;
  }, [peer.applyLocalAudioTrack]);

  const handleSignalRef = useRef(peer.handleSignal);
  handleSignalRef.current = peer.handleSignal;

  useEffect(() => {
    signaling.setOnSignal((row) => {
      void handleSignalRef.current(row);
    });
  }, [signaling.setOnSignal]);

  const onManualPeerHardResetReadyRef = useRef(onManualPeerHardResetReady);
  onManualPeerHardResetReadyRef.current = onManualPeerHardResetReady;

  const manualPeerHardResetRef = useRef(peer.manualPeerHardReset);
  manualPeerHardResetRef.current = peer.manualPeerHardReset;

  useEffect(() => {
    onManualPeerHardResetReadyRef.current?.(manualPeerHardResetRef.current);
  }, [peer.manualPeerHardReset]);

  const handleRemotePlaybackHealthChange = useCallback(
    (remoteId: string, health: RemotePlaybackHealth) => {
      peer.handleRemotePlaybackHealthChange(remoteId, health);
      onRemotePlaybackHealthChange?.(remoteId, health);
    },
    [onRemotePlaybackHealthChange, peer.handleRemotePlaybackHealthChange]
  );

  return (
    <>
      {mic.audioInputs.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <select
            value={mic.selectedMicId}
            onChange={(e) => mic.setSelectedMicId(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            {mic.audioInputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || "マイク"}
              </option>
            ))}
          </select>
        </div>
      )}

      {Object.entries(peer.remoteAudios).map(([remoteId, state]) => (
        <RemoteAudio
          key={
            getVoiceMode() === "ios_conservative"
              ? remoteId
              : `${remoteId}-${state.attachSeq}`
          }
          stream={state.stream}
          remoteId={remoteId}
          replayReason={state.replayReason ?? null}
          onSpeaking={onRemoteSpeakingChange}
          onPlaybackHealthChange={handleRemotePlaybackHealthChange}
          onPlaybackUnconfirmedTimeout={peer.handlePlaybackUnconfirmedTimeout}
        />
      ))}
    </>
  );
}