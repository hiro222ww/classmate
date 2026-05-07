export type VoiceLogPhase = "start" | "fallback" | "connected" | "failed";

export async function logVoiceConnectionEvent(params: {
  sessionId: string;
  deviceId: string;
  remoteDeviceId: string;
  phase: VoiceLogPhase;
  route?: string;
  usedTurn?: boolean;
  connectionState?: string;
  timeToConnectMs?: number | null;
  localCandidateType?: string | null;
  remoteCandidateType?: string | null;
  voiceRoute?: string;
}) {
  try {
    await fetch("/api/voice-connection-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      cache: "no-store",
    });
  } catch (e) {
    console.warn("[call] voice log failed", e);
  }
}