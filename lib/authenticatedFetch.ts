"use client";

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

  const token = await getAuthAccessToken();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
