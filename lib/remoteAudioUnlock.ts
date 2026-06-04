"use client";

import { debugConsoleLog, debugConsoleInfo } from "@/lib/debugVoiceLog";
type UnlockListener = () => void;
type PlayAllListener = () => void;

const listeners = new Set<UnlockListener>();
const playAllListeners = new Set<PlayAllListener>();
let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new Ctx();
  }
  return sharedAudioContext;
}

export async function resumeSharedAudioContext(): Promise<boolean> {
  const ctx = getSharedAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {});
  }
  return ctx.state === "running";
}

function unlockDomAudioElements() {
  if (typeof document === "undefined") return;

  document.querySelectorAll("audio[data-remote]").forEach((node) => {
    const el = node as HTMLAudioElement;
    el.muted = false;
    el.defaultMuted = false;
    el.volume = 1;
    el.autoplay = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    void el.play().catch(() => {});
  });
}

export function registerRemoteAudioPlayAll(listener: PlayAllListener) {
  playAllListeners.add(listener);
  return () => {
    playAllListeners.delete(listener);
  };
}

export function requestRemoteAudioUnlock() {
  unlockDomAudioElements();
  void resumeSharedAudioContext();

  const remoteIds = Array.from(playAllListeners).length;
  debugConsoleLog(
    `[remote-audio] play-attempt-all reason=user_unlock remotes=${remoteIds}`
  );

  for (const listener of playAllListeners) {
    try {
      listener();
    } catch {
      // ignore per-element failures
    }
  }

  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore per-element failures
    }
  }
}

export function subscribeRemoteAudioUnlock(listener: UnlockListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
