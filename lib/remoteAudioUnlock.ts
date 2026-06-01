"use client";

type UnlockListener = () => void;

const listeners = new Set<UnlockListener>();

export function requestRemoteAudioUnlock() {
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
