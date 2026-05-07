"use client";

import { useEffect, useMemo } from "react";
import RemoteAudio from "./voice/RemoteAudio";
import { useLocalMic } from "./voice/useLocalMic";
import { useCallSignaling } from "./voice/useCallSignaling";
import { usePeerConnections } from "./voice/usePeerConnections";

type Member = {
  device_id: string;
  display_name: string;
  photo_path?: string | null;
  screen?: string;
  last_seen_at?: string | null;
  is_in_call?: boolean;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";

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
  console.log("[voice-layer] render", {
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
    isMuted,
    micReady: mic.micReady,
    signalReady: signaling.signalReady,
    localStreamRef: mic.localStreamRef,
    localAudioTrackRef: mic.localAudioTrackRef,
    sendSignal: signaling.sendSignal,
    onRemoteCountChange,
    onStatusChange,
    onPeerStatesChange,
  });

  useEffect(() => {
    signaling.setOnSignal(peer.handleSignal);
  }, [signaling.setOnSignal, peer.handleSignal]);

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
          key={remoteId}
          stream={state.stream}
          remoteId={remoteId}
          onSpeaking={onRemoteSpeakingChange}
        />
      ))}
    </>
  );
}