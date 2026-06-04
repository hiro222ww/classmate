"use client";

import {
  normalizeVoiceTransportSettings,
  type VoiceTransportSettings,
} from "@/lib/voiceTransportMode";

export type CachedVoiceTransport = ReturnType<
  typeof normalizeVoiceTransportSettings
>;

type VoiceSettingsCacheEntry = {
  transport: CachedVoiceTransport;
  voiceEnabled: boolean;
  emergencyMessage: string | null;
};

let activeSessionId = "";
let voiceSettingsCache: VoiceSettingsCacheEntry | null = null;
type CachedIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

let turnIceServersCache: CachedIceServer[] | null = null;
let turnProviderCache: string | null = null;

export function resetSessionVoiceCache(sessionId: string) {
  const next = String(sessionId ?? "").trim();
  if (!next) return;
  if (next === activeSessionId) return;
  activeSessionId = next;
  voiceSettingsCache = null;
  turnIceServersCache = null;
  turnProviderCache = null;
}

export function getCachedVoiceTransport(sessionId: string) {
  if (String(sessionId ?? "").trim() !== activeSessionId) return null;
  return voiceSettingsCache;
}

export function setCachedVoiceTransport(
  sessionId: string,
  raw: VoiceTransportSettings & {
    voice_enabled?: boolean;
    emergency_message?: string | null;
  }
) {
  const key = String(sessionId ?? "").trim();
  if (!key) return;
  activeSessionId = key;
  const transport = normalizeVoiceTransportSettings(raw);
  voiceSettingsCache = {
    transport,
    voiceEnabled: raw.voice_enabled !== false,
    emergencyMessage:
      typeof raw.emergency_message === "string"
        ? raw.emergency_message
        : null,
  };
}

export function getCachedTurnIceServers(sessionId: string) {
  if (String(sessionId ?? "").trim() !== activeSessionId) return null;
  return turnIceServersCache;
}

export function getCachedTurnProvider(sessionId: string) {
  if (String(sessionId ?? "").trim() !== activeSessionId) return null;
  return turnProviderCache;
}

export function setCachedTurnIceServers(
  sessionId: string,
  iceServers: CachedIceServer[],
  provider: string
) {
  const key = String(sessionId ?? "").trim();
  if (!key || iceServers.length === 0) return;
  activeSessionId = key;
  turnIceServersCache = iceServers;
  turnProviderCache = provider;
}
