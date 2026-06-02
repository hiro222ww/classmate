"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import RemoteAudio, {
  type RemotePlaybackHealth,
} from "./voice/RemoteAudio";
import { useLocalMic, releaseSessionMic } from "./voice/useLocalMic";
import { useCallSignaling } from "./voice/useCallSignaling";
import { usePeerConnections } from "./voice/usePeerConnections";
import {
  compactDeviceId,
  voiceDebugLog,
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
  isMuted: boolean;
  onMicReadyChange?: (ready: boolean) => void;
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
};

export default function CallVoiceLayer({
  sessionId,
  deviceId,
  members,
  membersSyncRevision = 0,
  isMuted,
  onMicReadyChange,
  onMicLevelChange,
  onRemoteSpeakingChange,
  onRemotePlaybackHealthChange,
  onRemoteCountChange,
  onStatusChange,
  onPeerStatesChange,
  onPeerDiagnosticsChange,
  onVoiceCleanup,
}: CallVoiceLayerProps) {
  const instanceRef = useRef(createVoiceLayerInstanceId());
  const instanceId = instanceRef.current;

  voiceDebugLog("[voice-layer] render", {
    sessionId,
    deviceId,
    membersCount: members.length,
    members: members.map((m) => ({
      device_id: m.device_id,
      is_in_call: m.is_in_call,
    })),
    isMuted,
  });

  const mic = useLocalMic({
    sessionId,
    deviceId,
    isMuted,
    onMicReadyChange,
    onMicLevelChange,
    onStatusChange,
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
    isMuted,
    micReady: mic.micReady,
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
    console.log(
      `[voice-layer] mount instance=${instanceId} sessionId=${compactSessionId(sessionId)} deviceId=${compactDeviceId(deviceId)}`
    );
    return () => {
      console.log(
        `[voice-layer] unmount instance=${instanceId} sessionId=${compactSessionId(sessionId)} deviceId=${compactDeviceId(deviceId)}`
      );
      releaseSessionMic("voice_layer_unmount", sessionId);
    };
  }, [deviceId, instanceId, sessionId]);

  useEffect(() => {
    logVoiceClientEnv("voice-layer-mount");
  }, []);

  useEffect(() => {
    signaling.setOnSignal(peer.handleSignal);
  }, [signaling.setOnSignal, peer.handleSignal]);

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
          onSpeaking={onRemoteSpeakingChange}
          onPlaybackHealthChange={handleRemotePlaybackHealthChange}
        />
      ))}
    </>
  );
}