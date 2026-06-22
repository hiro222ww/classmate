"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { USER_ID_CACHE_KEY } from "@/lib/userIdentity";

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

export async function ensureAnonymousAuthSession(): Promise<Session | null> {
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
  const session = await ensureAnonymousAuthSession();
  if (!session?.access_token) {
    return { ok: false as const, error: "anonymous_sign_in_failed" };
  }

  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
      "x-device-id": deviceId,
    },
    body: JSON.stringify({ deviceId }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    return {
      ok: false as const,
      error: json?.error ?? "session_bootstrap_failed",
    };
  }

  cacheUserId(String(json.userId ?? session.user.id ?? ""));

  return {
    ok: true as const,
    status: json,
  };
}

export async function linkEmailAddress(email: string) {
  const normalized = String(email ?? "").trim();
  if (!normalized) {
    return { ok: false as const, error: "email_required" };
  }

  const { data, error } = await supabaseAuthClient.auth.updateUser({
    email: normalized,
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return {
    ok: true as const,
    user: data.user,
  };
}
