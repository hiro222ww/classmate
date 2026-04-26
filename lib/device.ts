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

  // 🔥 ① URLの dev を最優先（最重要）
  try {
    const params = new URLSearchParams(window.location.search);
    const devFromUrl = params.get("dev");

    if (devFromUrl && /^\d+$/.test(devFromUrl)) {
      return `test-device-${devFromUrl}`;
    }
  } catch {
    // ignore
  }

  // ② devMode（iframeなど）
  if (isDevFeatureEnabled()) {
    const devId = getDevDeviceId();
    if (devId && devId.trim()) {
      return devId.trim();
    }
  }

  // ③ 通常ユーザー
  return getOrCreateDeviceId();
}

export function clearDeviceId() {
  if (!isBrowser()) return;
  localStorage.removeItem(DEVICE_ID_KEY);
}