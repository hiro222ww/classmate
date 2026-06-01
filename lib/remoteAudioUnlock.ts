"use client";

type UnlockListener = () => void;

const listeners = new Set<UnlockListener>();
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

export function requestRemoteAudioUnlock() {
  unlockDomAudioElements();
  void resumeSharedAudioContext();

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
