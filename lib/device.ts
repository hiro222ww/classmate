import { getDevDeviceId, isDevFeatureEnabled } from "@/lib/devMode";

export const DEVICE_ID_KEY = "classmate_device_id";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getOrCreateDeviceId(): string {
  if (!isBrowser()) return "";

  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.trim()) {
    return existing.trim();
  }

  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getDeviceId(): string {
  if (!isBrowser()) return "";

  if (isDevFeatureEnabled()) {
    const devId = getDevDeviceId();
    if (devId && devId.trim()) {
      return devId.trim();
    }
  }

  return getOrCreateDeviceId();
}

export function clearDeviceId() {
  if (!isBrowser()) return;
  localStorage.removeItem(DEVICE_ID_KEY);
}