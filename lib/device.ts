import {
  getDevDeviceId,
  isDevFeatureEnabled,
  resolveDevDeviceIdFromKey,
} from "@/lib/devMode";
import { isValidDeviceUuid } from "@/lib/deviceIdValidation";

export const DEVICE_ID_KEY = "classmate_device_id";

function isBrowser() {
  return typeof window !== "undefined";
}

export function createDeviceUuid(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getOrCreateDeviceId(): string {
  if (!isBrowser()) return "";

  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.trim()) {
    const trimmed = existing.trim();
    if (isValidDeviceUuid(trimmed)) {
      return trimmed;
    }
    console.warn("[device] legacy device id format detected, issuing new uuid");
    localStorage.removeItem(DEVICE_ID_KEY);
  }

  const id = createDeviceUuid();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getDeviceId(): string {
  if (!isBrowser()) return "";

  // 🔥 ① URLの dev を最優先（最重要）
  try {
    const params = new URLSearchParams(window.location.search);
    const devFromUrl = params.get("dev");

    if (devFromUrl) {
      const resolved = resolveDevDeviceIdFromKey(devFromUrl);
      if (resolved) return resolved;
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