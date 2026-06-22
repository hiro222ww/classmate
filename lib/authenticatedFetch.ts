"use client";

import { getOrCreateDeviceSecret } from "@/lib/deviceSecretClient";
import { DEVICE_SECRET_HEADER } from "@/lib/deviceSecret";
import { getAuthAccessToken } from "@/lib/authClient";
import { getDeviceId } from "@/lib/device";

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers ?? {});
  const deviceId = getDeviceId();

  if (deviceId && !headers.has("x-device-id")) {
    headers.set("x-device-id", deviceId);
  }

  const deviceSecret = getOrCreateDeviceSecret();
  if (deviceSecret && !headers.has(DEVICE_SECRET_HEADER)) {
    headers.set(DEVICE_SECRET_HEADER, deviceSecret);
  }

  const token = await getAuthAccessToken();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
