const STORAGE_KEY = "classmate_device_id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";

  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing && existing.trim()) {
    return existing.trim();
  }

  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(STORAGE_KEY) || "").trim();
}

export function clearDeviceId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}