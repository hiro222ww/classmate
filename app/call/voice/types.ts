export type Member = {
  device_id: string;
  display_name: string;
  photo_path?: string | null;
  screen?: string;
  last_seen_at?: string | null;
  is_in_call?: boolean;
};

export type SignalType = "offer" | "answer" | "ice" | "leave";

export type SignalPayload = {
  connectionId?: string;
  sdp?: RTCSessionDescriptionInit | null;
  candidate?: RTCIceCandidateInit | null;
};

export type SignalRow = {
  id: number;
  session_id: string;
  from_device_id: string;
  to_device_id: string | null;
  signal_type: SignalType;
  payload: SignalPayload | null;
  created_at: string;
};

export type RemoteAudioState = {
  stream: MediaStream;
  member?: Member;
};

export type PeerState = "idle" | "connecting" | "connected" | "failed";

export type VoiceRoute = "stun" | "turn";

export type CallVoiceLayerProps = {
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