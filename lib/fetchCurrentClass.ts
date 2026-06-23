"use client";

import { supabaseAuthClient } from "@/lib/authClient";
import type { CurrentClassSnapshot } from "@/lib/currentClassTypes";

export type CurrentClassFetchResult = {
  ok: boolean;
  hasMembership: boolean;
  current: CurrentClassSnapshot | null;
  error?: string;
};

export async function buildDeviceAuthHeaders(
  deviceId: string
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "x-device-id": deviceId,
  };

  try {
    const session = (await supabaseAuthClient.auth.getSession()).data.session;
    const token = String(session?.access_token ?? "").trim();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
  } catch {
    // auth optional for anonymous devices
  }

  return headers;
}

export async function fetchCurrentClass(
  deviceId: string
): Promise<CurrentClassFetchResult> {
  const id = String(deviceId ?? "").trim();
  if (!id) {
    return {
      ok: false,
      hasMembership: false,
      current: null,
      error: "device_id_missing",
    };
  }

  try {
    const qs = new URLSearchParams({ deviceId: id });
    const res = await fetch(`/api/me/current-class?${qs.toString()}`, {
      cache: "no-store",
      headers: await buildDeviceAuthHeaders(id),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        hasMembership: false,
        current: null,
        error: String(json?.error ?? `current_class:${res.status}`),
      };
    }

    return {
      ok: true,
      hasMembership: json.hasMembership === true,
      current: json.current ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      hasMembership: false,
      current: null,
      error: error instanceof Error ? error.message : "current_class_fetch_failed",
    };
  }
}
