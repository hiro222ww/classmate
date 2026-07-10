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

export async function fetchSelfProfile(deviceId: string) {
  const id = String(deviceId ?? "").trim();
  if (!id) {
    return { ok: false as const, profile: null };
  }

  try {
    const res = await fetch(`/api/profile?device_id=${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: await buildDeviceAuthHeaders(id),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      return { ok: false as const, profile: null };
    }

    const profile =
      json?.profile && typeof json.profile === "object"
        ? json.profile
        : json?.device_id
          ? json
          : null;

    return { ok: true as const, profile };
  } catch {
    return { ok: false as const, profile: null };
  }
}

export type DeviceEntitlements = {
  device_id?: string;
  user_id?: string | null;
  plan?: string;
  class_slots?: number;
  can_create_classes?: boolean;
  topic_plan?: number;
  theme_pass?: boolean;
  updated_at?: string;
};

export async function fetchEntitlementsForDevice(deviceId: string) {
  const id = String(deviceId ?? "").trim();
  if (!id) {
    return { ok: false as const, entitlements: null as DeviceEntitlements | null };
  }

  try {
    const res = await fetch("/api/user/entitlements", {
      method: "GET",
      headers: await buildDeviceAuthHeaders(id),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as DeviceEntitlements | null;

    if (!res.ok || !json || typeof json !== "object" || "error" in json) {
      return { ok: false as const, entitlements: null };
    }

    return { ok: true as const, entitlements: json };
  } catch {
    return { ok: false as const, entitlements: null };
  }
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
