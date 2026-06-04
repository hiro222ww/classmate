"use client";

import { debugConsoleLog, debugConsoleInfo } from "@/lib/debugVoiceLog";
export type VoiceMode =
  | "desktop_default"
  | "ios_conservative"
  | "windows_audio_safe";

export type VoiceClientEnv = {
  isIOS: boolean;
  isIPadOS: boolean;
  isWindows: boolean;
  isSafari: boolean;
  isStandalonePWA: boolean;
  voiceMode: VoiceMode;
};

function readReleaseMicOnMuteOverride(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") return null;
    const value = storage.getItem("classmate_release_mic_on_mute");
    if (value === "1" || value === "true") return true;
    if (value === "0" || value === "false") return false;
  } catch {
    return null;
  }
  return null;
}

export type VoiceModePolicy = {
  voiceMode: VoiceMode;
  /** When true, mute stops getUserMedia capture (iOS Safari mic indicator). */
  releaseMicOnMute: boolean;
  trackEndedReconnectMs: number;
  fastReconnectMs: number;
  healPeerCooldownMs: number;
  healIntervalMs: number;
  trackEndedForceReconnect: boolean;
  trackEndedImmediateEnsure: boolean;
  trackEndedBackupEnsure: boolean;
  trackEndedSetConnecting: boolean;
  aggressivePlayRetry: boolean;
  ontrackDelayedPlayMs: number | null;
  clearAudioSrcBeforeReattach: boolean;
  disableRemoteAudioMeter: boolean;
  preserveRemoteAudioOnReconnect: boolean;
};

const POLICIES: Record<
  VoiceMode,
  Omit<VoiceModePolicy, "voiceMode">
> = {
  desktop_default: {
    releaseMicOnMute: false,
    trackEndedReconnectMs: 300,
    fastReconnectMs: 300,
    healPeerCooldownMs: 800,
    healIntervalMs: 3000,
    trackEndedForceReconnect: true,
    trackEndedImmediateEnsure: true,
    trackEndedBackupEnsure: true,
    trackEndedSetConnecting: true,
    aggressivePlayRetry: true,
    ontrackDelayedPlayMs: 300,
    clearAudioSrcBeforeReattach: false,
    disableRemoteAudioMeter: false,
    preserveRemoteAudioOnReconnect: true,
  },
  ios_conservative: {
    releaseMicOnMute: true,
    trackEndedReconnectMs: 2000,
    fastReconnectMs: 1500,
    healPeerCooldownMs: 2500,
    healIntervalMs: 5000,
    trackEndedForceReconnect: false,
    trackEndedImmediateEnsure: false,
    trackEndedBackupEnsure: false,
    trackEndedSetConnecting: false,
    aggressivePlayRetry: false,
    ontrackDelayedPlayMs: null,
    clearAudioSrcBeforeReattach: false,
    disableRemoteAudioMeter: false,
    preserveRemoteAudioOnReconnect: true,
  },
  windows_audio_safe: {
    releaseMicOnMute: false,
    trackEndedReconnectMs: 300,
    fastReconnectMs: 300,
    healPeerCooldownMs: 800,
    healIntervalMs: 3000,
    trackEndedForceReconnect: true,
    trackEndedImmediateEnsure: true,
    trackEndedBackupEnsure: true,
    trackEndedSetConnecting: true,
    aggressivePlayRetry: true,
    ontrackDelayedPlayMs: 300,
    clearAudioSrcBeforeReattach: true,
    disableRemoteAudioMeter: true,
    preserveRemoteAudioOnReconnect: true,
  },
};

function detectVoiceClientEnv(): VoiceClientEnv {
  if (typeof navigator === "undefined") {
    return {
      isIOS: false,
      isIPadOS: false,
      isWindows: false,
      isSafari: false,
      isStandalonePWA: false,
      voiceMode: "desktop_default",
    };
  }

  const ua = navigator.userAgent;
  const uaLower = ua.toLowerCase();

  const isIPadOS =
    /ipad/.test(uaLower) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isIOS = /iphone|ipod/.test(uaLower) || isIPadOS;

  const isWindows = /windows/i.test(ua);

  const isSafari =
    /safari/i.test(ua) && !/chrome|crios|fxios|edgios|edg\//i.test(ua);

  const isStandalonePWA =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  let voiceMode: VoiceMode = "desktop_default";
  if (isWindows) {
    voiceMode = "windows_audio_safe";
  } else if (isIOS || isIPadOS) {
    voiceMode = "ios_conservative";
  }

  return {
    isIOS,
    isIPadOS,
    isWindows,
    isSafari,
    isStandalonePWA,
    voiceMode,
  };
}

let cachedEnv: VoiceClientEnv | null = null;
let cachedPolicy: VoiceModePolicy | null = null;

export function getVoiceClientEnv(): VoiceClientEnv {
  if (!cachedEnv) {
    cachedEnv = detectVoiceClientEnv();
  }
  return cachedEnv;
}

export function getVoiceMode(): VoiceMode {
  return getVoiceClientEnv().voiceMode;
}

export function getVoiceModePolicy(): VoiceModePolicy {
  if (!cachedPolicy) {
    const env = getVoiceClientEnv();
    const base = POLICIES[env.voiceMode];
    const override = readReleaseMicOnMuteOverride();
    cachedPolicy = {
      voiceMode: env.voiceMode,
      ...base,
      releaseMicOnMute: override ?? base.releaseMicOnMute,
    };
  }
  return cachedPolicy;
}

export function formatVoiceModeSuffix(): string {
  return `voiceMode=${getVoiceMode()}`;
}

export function logVoiceClientEnv(context: string) {
  const env = getVoiceClientEnv();
  debugConsoleLog(
    `[voice-env] ${context} voiceMode=${env.voiceMode} ios=${env.isIOS} ` +
      `ipados=${env.isIPadOS} windows=${env.isWindows} safari=${env.isSafari} ` +
      `pwa=${env.isStandalonePWA}`
  );
}
