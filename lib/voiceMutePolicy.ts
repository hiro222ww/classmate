"use client";

import { voiceProdLog } from "@/lib/debugVoiceLog";

export const MUTE_TOGGLE_DEBOUNCE_MS = 350;
export const UNMUTE_OUTBOUND_REPAIR_DELAY_MS = 4000;

export function logVoiceMuteApply(params: {
  enabled: boolean;
  reason?: string;
}) {
  voiceProdLog(
    `[voice-mute] apply enabled=${params.enabled ? "true" : "false"}` +
      (params.reason ? ` reason=${params.reason}` : "")
  );
}

export function logVoiceMuteRenegotiateSkipped(params: {
  reason: string;
  remoteId?: string;
}) {
  const remoteSuffix = params.remoteId
    ? ` remote=${params.remoteId.slice(-4)}`
    : "";
  voiceProdLog(
    `[voice-mute] renegotiate skipped reason=${params.reason}${remoteSuffix}`
  );
}

export function logVoiceMuteRenegotiateNeeded(params: {
  reason: string;
  remoteId?: string;
}) {
  const remoteSuffix = params.remoteId
    ? ` remote=${params.remoteId.slice(-4)}`
    : "";
  voiceProdLog(
    `[voice-mute] renegotiate needed reason=${params.reason}${remoteSuffix}`
  );
}
