"use client";

import { useState } from "react";
import type { CallVoiceLayerProps } from "./voice/types";
import RemoteAudio from "./voice/RemoteAudio";
import { useVoiceSettings } from "./voice/useVoiceSettings";
import { useMicrophone } from "./voice/useMicrophone";
import { useTurnFallback } from "./voice/useTurnFallback";
import { useRemoteAudios } from "./voice/useRemoteAudios";
import { useCallSignals } from "./voice/useCallSignals";
import { usePeerConnections } from "./voice/usePeerConnections";

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
  const [signalReady, setSignalReady] = useState(false);

  const { turnFallbackEnabled } = useVoiceSettings({
    onStatusChange,
  });

  const mic = useMicrophone({
  isMuted,
  onMicReadyChange,
  onMicLevelChange,
});

  const remoteAudio = useRemoteAudios({
    members,
    onRemoteCountChange,
  });

  const turn = useTurnFallback({
    turnFallbackEnabled,
  });

  const peers = usePeerConnections({
    sessionId,
    deviceId,
    members,
    isMuted,
    micReady: mic.micReady,
    signalReady,
    localStreamRef: mic.localStreamRef,
    localAudioTrackRef: mic.localAudioTrackRef,
    iceServersRef: turn.iceServersRef,
    voiceRouteRef: turn.voiceRouteRef,
    enableTurnFallback: turn.enableTurnFallback,
    onStatusChange,
    onPeerStatesChange,
    upsertRemoteAudio: remoteAudio.upsertRemoteAudio,
    removeRemoteAudio: remoteAudio.removeRemoteAudio,
  });

  useCallSignals({
    sessionId,
    deviceId,
    onSignal: peers.handleSignal,
    onReadyChange: setSignalReady,
  });

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

      {Object.entries(remoteAudio.remoteAudios).map(([remoteId, state]) => (
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