// lib/device.ts
export const DEVICE_ID_KEY = "classmate_device_id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DEVICE_ID_KEY) ?? "";
}