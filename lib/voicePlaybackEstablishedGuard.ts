import {
  isExplicitPeerCloseReason,
  STABLE_CLOSE_REQUIRES_EVIDENCE,
} from "./stableVoiceJoin";

export type VoicePlaybackEstablishedEvidence = {
  hasPlaybackEvidence: boolean;
  audioConfirmedStrict: boolean;
};

export type VoicePeerMutationContext = {
  reason: string;
  caller: string;
  manualHealPass?: boolean;
  force?: boolean;
};

export type VoicePeerMutationBlockResult = {
  blocked: boolean;
  blockedByPlaybackEvidence: boolean;
  blockedByAudioConfirmedStrict: boolean;
};

const MANUAL_VOICE_PEER_MUTATION_MARKERS = [
  "manual_reconnect",
  "manual_hard_reset",
  "user_requested_audio_reconnect",
] as const;

export function shouldProtectVoicePeerFromAutoMutation(
  evidence: VoicePlaybackEstablishedEvidence
): boolean {
  return evidence.hasPlaybackEvidence || evidence.audioConfirmedStrict;
}

export function shouldSuppressAutoVoiceRecovery(
  evidence: VoicePlaybackEstablishedEvidence
): boolean {
  return shouldProtectVoicePeerFromAutoMutation(evidence);
}

export function getEstablishedPeerAutoRecoverySkipReason(
  evidence: VoicePlaybackEstablishedEvidence
): "audio_confirmed_strict" | "playback_evidence" | null {
  if (evidence.audioConfirmedStrict) return "audio_confirmed_strict";
  if (evidence.hasPlaybackEvidence) return "playback_evidence";
  return null;
}

export function isManualVoicePeerReconnectMutation(
  ctx: VoicePeerMutationContext
): boolean {
  if (ctx.manualHealPass) return true;
  if (ctx.force === true && matchesManualVoicePeerMutation(ctx.reason)) {
    return true;
  }
  return (
    matchesManualVoicePeerMutation(ctx.reason) ||
    matchesManualVoicePeerMutation(ctx.caller)
  );
}

function matchesManualVoicePeerMutation(value: string): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return MANUAL_VOICE_PEER_MUTATION_MARKERS.some((marker) =>
    normalized.includes(marker)
  );
}

export function isLifecycleVoicePeerCloseReason(reason: string): boolean {
  const normalized = String(reason ?? "").trim();
  if (!normalized) return false;
  return (
    isExplicitPeerCloseReason(normalized) ||
    STABLE_CLOSE_REQUIRES_EVIDENCE.has(normalized) ||
    normalized === "component_unmount" ||
    normalized === "session_changed" ||
    normalized === "device_changed"
  );
}

export function evaluateVoicePeerMutationBlock(params: {
  kind: "create" | "close";
  evidence: VoicePlaybackEstablishedEvidence;
  ctx: VoicePeerMutationContext;
}): VoicePeerMutationBlockResult {
  const empty = {
    blocked: false,
    blockedByPlaybackEvidence: false,
    blockedByAudioConfirmedStrict: false,
  };

  if (isManualVoicePeerReconnectMutation(params.ctx)) {
    return empty;
  }

  if (
    params.kind === "close" &&
    isLifecycleVoicePeerCloseReason(params.ctx.reason)
  ) {
    return empty;
  }

  if (!shouldProtectVoicePeerFromAutoMutation(params.evidence)) {
    return empty;
  }

  return {
    blocked: true,
    blockedByPlaybackEvidence: params.evidence.hasPlaybackEvidence,
    blockedByAudioConfirmedStrict: params.evidence.audioConfirmedStrict,
  };
}
