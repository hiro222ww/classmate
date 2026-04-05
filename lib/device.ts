// lib/device.ts

export const DEVICE_ID_KEY = "classmate_device_id";

function isBrowser() {
  return typeof window !== "undefined";
}

function isDevMode() {
  return process.env.NODE_ENV !== "production";
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

/**
 * 🔥 ここだけ変える
 */
export function getDeviceId(): string {
  if (!isBrowser()) return "";

  // devモードだけ仮想ユーザー有効
  if (isDevMode()) {
    const params = new URLSearchParams(window.location.search);
    const dev = (params.get("dev") ?? "").trim();

    if (dev) {
      return `test-device-${dev}`;
    }
  }

  // 通常
  return getOrCreateDeviceId();
}

export function clearDeviceId() {
  if (!isBrowser()) return;
  localStorage.removeItem(DEVICE_ID_KEY);
}