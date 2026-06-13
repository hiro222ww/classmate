import type { OneWayAudioSubClass } from "@/lib/voiceAudioDiagnostics";

/** First bidirectional check after Call voice join (8–12s window). */
export const INITIAL_BIDIRECTIONAL_CHECK_MS = 10_000;

export const MAX_VOICE_SOFT_RESET_ATTEMPTS = 2;

/** Minimum gap between soft resets for the same remote peer. */
export const VOICE_SOFT_RESET_MIN_INTERVAL_MS = 8_000;

export type VoiceSoftResetTriggerReason =
  | "no_remote_track_ice_connected"
  | "track_no_playback_evidence"
  | "one_way_rtp"
  | "one_way_audio_subclass"
  | "bidirectional_not_established"
  | "max_attempts";

export type VoiceSoftResetEvalInput = {
  joinAgeMs: number;
  iceConnected: boolean;
  remoteTrackReceived: boolean;
  audioConfirmedStrict: boolean;
  hasPlaybackEvidence: boolean;
  inboundDeltaBytes: number;
  outboundDeltaBytes: number;
  subClass: OneWayAudioSubClass;
  softResetAttempts: number;
  lastSoftResetAt: number | null;
  nowMs?: number;
  userIntentionallyMuted?: boolean;
  negotiationComplete?: boolean;
  passiveFallbackOfferSent?: boolean;
  softResetAlreadyOnConnection?: boolean;
  awaitingActiveOffer?: boolean;
};

export function shouldBlockVoiceSoftReset(
  input: Pick<
    VoiceSoftResetEvalInput,
    "audioConfirmedStrict" | "hasPlaybackEvidence"
  >
): boolean {
  return input.audioConfirmedStrict || input.hasPlaybackEvidence;
}

export function isBidirectionalAudioEstablished(
  input: Pick<
    VoiceSoftResetEvalInput,
    | "remoteTrackReceived"
    | "inboundDeltaBytes"
    | "outboundDeltaBytes"
    | "subClass"
    | "audioConfirmedStrict"
    | "hasPlaybackEvidence"
    | "userIntentionallyMuted"
  >
): boolean {
  if (input.audioConfirmedStrict || input.hasPlaybackEvidence) return true;
  if (input.userIntentionallyMuted) {
    return (
      input.remoteTrackReceived &&
      input.inboundDeltaBytes > 0 &&
      input.subClass === "OK"
    );
  }
  return (
    input.remoteTrackReceived &&
    input.inboundDeltaBytes > 0 &&
    input.outboundDeltaBytes > 0 &&
    input.subClass === "OK"
  );
}

export function evaluateVoiceSoftResetTrigger(
  input: VoiceSoftResetEvalInput
): VoiceSoftResetTriggerReason | null {
  const nowMs = input.nowMs ?? Date.now();

  if (input.joinAgeMs < INITIAL_BIDIRECTIONAL_CHECK_MS) return null;
  if (input.awaitingActiveOffer) return null;
  if (shouldBlockVoiceSoftReset(input)) return null;
  if (input.softResetAttempts >= MAX_VOICE_SOFT_RESET_ATTEMPTS) {
    return "max_attempts";
  }
  if (input.softResetAlreadyOnConnection) return null;
  if (
    input.lastSoftResetAt != null &&
    nowMs - input.lastSoftResetAt < VOICE_SOFT_RESET_MIN_INTERVAL_MS
  ) {
    return null;
  }
  if (!input.iceConnected) return null;

  if (isBidirectionalAudioEstablished(input)) return null;

  if (!input.remoteTrackReceived) {
    return "no_remote_track_ice_connected";
  }

  if (!input.negotiationComplete) return null;

  if (
    input.remoteTrackReceived &&
    !input.hasPlaybackEvidence &&
    input.inboundDeltaBytes <= 0
  ) {
    return "track_no_playback_evidence";
  }

  const inboundOnly =
    input.inboundDeltaBytes > 0 && input.outboundDeltaBytes <= 0;
  const outboundOnly =
    input.outboundDeltaBytes > 0 && input.inboundDeltaBytes <= 0;

  if (inboundOnly || outboundOnly) {
    if (
      input.userIntentionallyMuted &&
      input.outboundDeltaBytes <= 0 &&
      inboundOnly
    ) {
      return null;
    }
    return "one_way_rtp";
  }

  if (input.subClass !== "OK") return "one_way_audio_subclass";

  if (input.userIntentionallyMuted) return null;

  return "bidirectional_not_established";
}
