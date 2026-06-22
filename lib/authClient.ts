"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { USER_ID_CACHE_KEY } from "@/lib/userIdentity";
import { getOrCreateDeviceSecret } from "@/lib/deviceSecretClient";
import { DEVICE_SECRET_HEADER } from "@/lib/deviceSecret";
import { buildAppUrl } from "@/lib/appOrigin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

declare global {
  // eslint-disable-next-line no-var
  var __classmate_supabase_auth__: SupabaseClient | undefined;
}

export const supabaseAuthClient =
  globalThis.__classmate_supabase_auth__ ??
  createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "classmate_supabase_auth",
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__classmate_supabase_auth__ = supabaseAuthClient;
}

export function isAuthCallbackInProgress(): boolean {
  if (typeof window === "undefined") return false;

  const path = window.location.pathname;
  if (path === "/login" || path.startsWith("/auth/callback")) {
    return true;
  }

  const hash = window.location.hash ?? "";
  const search = window.location.search ?? "";
  if (
    hash.includes("access_token=") ||
    hash.includes("refresh_token=") ||
    search.includes("code=") ||
    search.includes("token_hash=")
  ) {
    return true;
  }

  return false;
}

export async function ensureAnonymousAuthSession(): Promise<Session | null> {
  if (isAuthCallbackInProgress()) {
    const pending = (await supabaseAuthClient.auth.getSession()).data.session;
    if (pending?.access_token) {
      cacheUserId(pending.user.id);
      return pending;
    }
    return null;
  }

  const existing = (await supabaseAuthClient.auth.getSession()).data.session;
  if (existing?.access_token) {
    cacheUserId(existing.user.id);
    return existing;
  }

  const { data, error } = await supabaseAuthClient.auth.signInAnonymously();
  if (error) {
    console.error("[auth] anonymous sign-in failed", error.message);
    return null;
  }

  if (data.session) {
    cacheUserId(data.session.user.id);
  }

  return data.session ?? null;
}

export async function getAuthAccessToken() {
  const session = (await supabaseAuthClient.auth.getSession()).data.session;
  return session?.access_token ?? null;
}

export function cacheUserId(userId: string) {
  if (typeof window === "undefined") return;
  if (!userId) return;
  localStorage.setItem(USER_ID_CACHE_KEY, userId);
}

export function readCachedUserId() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(USER_ID_CACHE_KEY) ?? "";
}

export async function bootstrapAuthSession(deviceId: string) {
  if (isAuthCallbackInProgress()) {
    return { ok: false as const, error: "auth_callback_in_progress" };
  }

  const session = await ensureAnonymousAuthSession();
  if (!session?.access_token) {
    return { ok: false as const, error: "anonymous_sign_in_failed" };
  }

  const deviceSecret = getOrCreateDeviceSecret();

  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
      "x-device-id": deviceId,
      [DEVICE_SECRET_HEADER]: deviceSecret,
    },
    body: JSON.stringify({ deviceId, deviceSecret }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    return {
      ok: false as const,
      error: json?.error ?? "session_bootstrap_failed",
      message: json?.message ?? null,
    };
  }

  cacheUserId(String(json.userId ?? session.user.id ?? ""));

  return {
    ok: true as const,
    status: json,
  };
}

export async function completeAuthCallback(deviceId: string, redirectTo: string) {
  const { data, error } = await supabaseAuthClient.auth.getSession();
  if (error || !data.session?.access_token) {
    return {
      ok: false as const,
      error: error?.message ?? "session_missing",
    };
  }

  const deviceSecret = getOrCreateDeviceSecret();
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session.access_token}`,
      "x-device-id": deviceId,
      [DEVICE_SECRET_HEADER]: deviceSecret,
    },
    body: JSON.stringify({ deviceId, deviceSecret }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    return {
      ok: false as const,
      error: json?.error ?? "session_bootstrap_failed",
      message: json?.message ?? null,
    };
  }

  cacheUserId(String(json.userId ?? data.session.user.id ?? ""));

  if (typeof window !== "undefined") {
    window.location.replace(redirectTo);
  }

  return { ok: true as const };
}

export async function signInWithMagicLink(email: string, redirectTo?: string) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) {
    return { ok: false as const, error: "email_required" };
  }

  const callback = buildAppUrl(
    `/auth/callback?redirect=${encodeURIComponent(redirectTo || "/home")}`
  );

  const { error } = await supabaseAuthClient.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: callback,
    },
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

export async function linkEmailAddress(email: string) {
  const normalized = String(email ?? "").trim();
  if (!normalized) {
    return { ok: false as const, error: "email_required" };
  }

  const callback = buildAppUrl("/auth/callback?redirect=/settings");

  const { data, error } = await supabaseAuthClient.auth.updateUser({
    email: normalized,
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return {
    ok: true as const,
    user: data.user,
    redirectHint: callback,
  };
}

export async function fetchAuthStatus(deviceId: string) {
  const token = await getAuthAccessToken();
  if (!token) return null;

  const res = await fetch("/api/auth/session", {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "x-device-id": deviceId,
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) return null;
  return json;
}
