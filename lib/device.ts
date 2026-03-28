// lib/device.ts

export const DEVICE_ID_KEY = "classmate_device_id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";

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
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(DEVICE_ID_KEY) || "").trim();
}

export function clearDeviceId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEVICE_ID_KEY);
}