import { createDeviceSecret, DEVICE_SECRET_KEY } from "@/lib/deviceSecret";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getOrCreateDeviceSecret(): string {
  if (!isBrowser()) return "";

  const existing = localStorage.getItem(DEVICE_SECRET_KEY);
  if (existing && existing.trim()) {
    return existing.trim();
  }

  const secret = createDeviceSecret();
  localStorage.setItem(DEVICE_SECRET_KEY, secret);
  return secret;
}

export function clearDeviceSecret() {
  if (!isBrowser()) return;
  localStorage.removeItem(DEVICE_SECRET_KEY);
}
