"use client";

import { createClient, type EmailOtpType, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { USER_ID_CACHE_KEY } from "@/lib/userIdentity";
import { getOrCreateDeviceSecret } from "@/lib/deviceSecretClient";
import { DEVICE_SECRET_HEADER } from "@/lib/deviceSecret";
import { buildAuthCallbackUrl, buildOAuthRedirectUrl, readRedirectToFromOAuthAuthorizeUrl, stashOAuthReturnTo } from "@/lib/authCallbackUrl";
import { isCapacitorNativeApp } from "@/lib/capacitorClient";
import { isCapacitorOAuthBrowserOpen, openCapacitorOAuthBrowser } from "@/lib/capacitorOAuthBrowser";
import {
  claimOAuthCallbackProcessing,
  clearAuthCallbackActive,
  isAuthCallbackActive,
  isOAuthCallbackProcessing,
  isOAuthCodeConsumed,
  markAuthCallbackActive,
  markOAuthCodeConsumed,
  readOAuthCodeFromLocation,
  releaseOAuthCallbackProcessing,
  stripOAuthParamsFromBrowserUrl,
  clearPendingNativeOAuthUrl,
  clearHandledNativeAuthReturnUrl,
} from "@/lib/oauthCallbackDedupe";
import {
  authEmailResendCooldownMessage,
  checkAuthEmailResendCooldown,
  formatAuthEmailError,
  isEmailAlreadyRegisteredError,
  isEmailRateLimitError,
  markAuthEmailSent,
} from "@/lib/authEmailErrors";
import { sanitizeReturnTo } from "@/lib/authAccount";
import {
  defaultAuthCallbackReturnTo,
  resolveAppShellReturnTo,
} from "@/lib/appShellContext";
import { buildShellAwareLoginUrl } from "@/lib/appShellNavigation";
import { formatAuthProviderError } from "@/lib/authProviderErrors";

export type AuthSessionPostResult =
  | { ok: true; status: Record<string, unknown> }
  | {
      ok: false;
      error: string;
      message?: string | null;
      action?: string | null;
      redirectTo?: string | null;
    };

async function postAuthSession(
  deviceId: string,
  accessToken: string,
  options?: { reregisterDevice?: boolean }
): Promise<AuthSessionPostResult> {
  const deviceSecret = getOrCreateDeviceSecret();

  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      "x-device-id": deviceId,
      [DEVICE_SECRET_HEADER]: deviceSecret,
    },
    body: JSON.stringify({
      deviceId,
      deviceSecret,
      reregisterDevice: options?.reregisterDevice === true,
    }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    return {
      ok: false as const,
      error: json?.error ?? "session_bootstrap_failed",
      message: json?.message ?? null,
      action: json?.action ?? null,
      redirectTo: json?.redirectTo ?? null,
    };
  }

  cacheUserId(String(json.userId ?? ""));

  return {
    ok: true as const,
    status: json,
  };
}

function logClientAuthRestore(payload: Record<string, unknown>) {
  const parts = Object.entries(payload)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`);
  console.info(`[auth-restore] ${parts.join(" ")}`);
}

function handleAuthSessionFailure(
  deviceId: string,
  result: Extract<AuthSessionPostResult, { ok: false }>
) {
  logClientAuthRestore({
    phase: "client_bootstrap_denied",
    deviceId,
    error: result.error,
    action: result.action ?? null,
    redirectTo: result.redirectTo ?? null,
  });

  if (result.action === "restore_login" && typeof window !== "undefined") {
    const path = window.location.pathname;
    if (
      path !== "/login" &&
      path !== "/app/login" &&
      !path.startsWith("/auth/callback")
    ) {
      console.warn("[auth] login required to restore account on this device");
    }
  }
}

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
      detectSessionInUrl: false,
      flowType: "pkce",
      storageKey: "classmate_supabase_auth",
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__classmate_supabase_auth__ = supabaseAuthClient;
}

export function isAuthCallbackInProgress(): boolean {
  if (typeof window === "undefined") return false;

  if (isAuthCallbackActive() || isOAuthCallbackProcessing()) {
    return true;
  }

  const path = window.location.pathname;
  if (
    path === "/login" ||
    path === "/app/login" ||
    path.startsWith("/auth/callback")
  ) {
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

  if (
    path === "/" &&
    (search.includes("code=") ||
      search.includes("token_hash=") ||
      hash.includes("access_token="))
  ) {
    return true;
  }

  return false;
}

export async function ensureAnonymousAuthSession(): Promise<Session | null> {
  if (isAuthCallbackInProgress() || isCapacitorOAuthBrowserOpen()) {
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
    if (error.message.includes("Anonymous sign-ins are disabled")) {
      console.info("[auth] anonymous sign-in skipped (disabled in Supabase)");
    } else {
      console.error("[auth] anonymous sign-in failed", error.message);
    }
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

  let result = await postAuthSession(deviceId, session.access_token);

  if (
    !result.ok &&
    result.action === "reregister_device" &&
    (result.error === "device_secret_required" ||
      result.error === "device_secret_mismatch")
  ) {
    logClientAuthRestore({
      phase: "client_reregister_device",
      deviceId,
      userId: session.user.id,
    });
    result = await postAuthSession(deviceId, session.access_token, {
      reregisterDevice: true,
    });
  }

  if (!result.ok) {
    handleAuthSessionFailure(deviceId, result);
    return result;
  }

  logClientAuthRestore({
    phase: "client_bootstrapped",
    deviceId,
    userId: String(result.status.userId ?? session.user.id ?? ""),
    linked: result.status.hasLinkedEmail ?? null,
    anonymous: result.status.isAnonymous ?? null,
    reregisteredDevice: result.status.reregisteredDevice ?? null,
  });

  return {
    ok: true as const,
    status: result.status,
  };
}

const AUTH_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function parseEmailOtpType(value: string | null): EmailOtpType | null {
  if (!value) return null;
  return AUTH_OTP_TYPES.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** PKCE code から Supabase セッションを確立（Capacitor ネイティブ戻り用） */
async function establishSessionFromOAuthCode(
  code: string,
  options?: { skipUrlStrip?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (isOAuthCodeConsumed(code)) {
    const { data } = await supabaseAuthClient.auth.getSession();
    if (data.session?.access_token) {
      cacheUserId(data.session.user.id);
      return { ok: true };
    }
    return { ok: false, error: "code_already_used" };
  }

  if (!claimOAuthCallbackProcessing(code)) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await wait(100);
      if (isOAuthCodeConsumed(code)) {
        const { data } = await supabaseAuthClient.auth.getSession();
        if (data.session?.access_token) {
          cacheUserId(data.session.user.id);
          return { ok: true };
        }
      }
    }
    return { ok: false, error: "callback_in_progress" };
  }

  try {
    const { error } = await supabaseAuthClient.auth.exchangeCodeForSession(code);
    if (error) {
      console.error(
        "[auth] exchangeCodeForSession failed",
        error.message,
        error
      );
      const { data } = await supabaseAuthClient.auth.getSession();
      if (data.session?.access_token) {
        markOAuthCodeConsumed(code);
        if (!options?.skipUrlStrip) {
          stripOAuthParamsFromBrowserUrl();
        }
        cacheUserId(data.session.user.id);
        return { ok: true };
      }
      releaseOAuthCallbackProcessing(code);
      return { ok: false, error: error.message };
    }

    markOAuthCodeConsumed(code);
    if (!options?.skipUrlStrip) {
      stripOAuthParamsFromBrowserUrl();
    }
    return { ok: true };
  } catch (exchangeError) {
    console.error("[auth] exchangeCodeForSession threw", exchangeError);
    releaseOAuthCallbackProcessing(code);
    return { ok: false, error: "exchange_failed" };
  }
}

/** メールリンク（PKCE / token_hash / implicit hash）からセッションを確立 */
export async function establishSessionFromAuthCallbackUrl(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (typeof window === "undefined") {
    return { ok: false, error: "not_in_browser" };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const code = readOAuthCodeFromLocation(
    window.location.search,
    window.location.hash
  );

  if (code) {
    return establishSessionFromOAuthCode(code);
  }

  const tokenHash = searchParams.get("token_hash");
  const otpType = parseEmailOtpType(searchParams.get("type"));
  if (tokenHash && otpType) {
    const { error } = await supabaseAuthClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (!error) {
      return { ok: true };
    }
    console.warn("[auth] verifyOtp failed", error.message);
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabaseAuthClient.auth.getSession();
    if (error) {
      console.warn("[auth] getSession during callback", error.message);
    }
    if (data.session?.access_token) {
      cacheUserId(data.session.user.id);
      return { ok: true };
    }
    await wait(150);
  }

  return { ok: false, error: "session_missing" };
}

type CompleteAuthCallbackResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      message?: string | null;
      action?: string | null;
      redirectTo?: string | null;
    };

let completeAuthCallbackInflight: Promise<CompleteAuthCallbackResult> | null =
  null;
let completeAuthCallbackInflightKey: string | null = null;

export async function completeAuthCallback(
  deviceId: string,
  redirectTo: string,
  options?: { oauthCode?: string }
): Promise<CompleteAuthCallbackResult> {
  const callbackKey =
    options?.oauthCode ??
    (typeof window !== "undefined"
      ? readOAuthCodeFromLocation() ??
        new URLSearchParams(window.location.search).get("token_hash") ??
        window.location.href
      : redirectTo);

  if (
    completeAuthCallbackInflight &&
    completeAuthCallbackInflightKey === callbackKey
  ) {
    return completeAuthCallbackInflight;
  }

  const run = async (): Promise<CompleteAuthCallbackResult> => {
    markAuthCallbackActive();

    try {
      const established = options?.oauthCode
        ? await establishSessionFromOAuthCode(options.oauthCode, {
            skipUrlStrip: true,
          })
        : await establishSessionFromAuthCallbackUrl();
      if (!established.ok) {
        return {
          ok: false as const,
          error: established.error ?? "session_missing",
          message:
            "ログインに失敗しました。もう一度 Google でログインしてください。",
        };
      }

      const { data, error } = await supabaseAuthClient.auth.getSession();
      if (error || !data.session?.access_token) {
        return {
          ok: false as const,
          error: error?.message ?? "session_missing",
        };
      }

      logClientAuthRestore({
        phase: "callback_start",
        deviceId,
        userId: data.session.user.id,
        email: data.session.user.email ?? null,
        anonymous: data.session.user.is_anonymous ?? null,
        redirectTo,
      });

      let result = await postAuthSession(deviceId, data.session.access_token);

      if (
        !result.ok &&
        result.action === "reregister_device" &&
        (result.error === "device_secret_required" ||
          result.error === "device_secret_mismatch")
      ) {
        logClientAuthRestore({
          phase: "callback_reregister_device",
          deviceId,
          userId: data.session.user.id,
        });
        result = await postAuthSession(deviceId, data.session.access_token, {
          reregisterDevice: true,
        });
      }

      if (!result.ok) {
        handleAuthSessionFailure(deviceId, result);
        const needsProfile =
          result.error === "profile_device_conflict" ||
          result.error === "profile_user_mismatch";
        return {
          ok: false as const,
          error: result.error,
          message: result.message ?? null,
          action: result.action ?? null,
          redirectTo: needsProfile
            ? `/profile?returnTo=${encodeURIComponent(sanitizeReturnTo(redirectTo))}`
            : result.redirectTo ?? buildShellAwareLoginUrl(redirectTo),
        };
      }

      logClientAuthRestore({
        phase: "callback_bootstrapped",
        deviceId,
        userId: String(result.status.userId ?? data.session.user.id ?? ""),
        email: data.session.user.email ?? null,
        linked: result.status.hasLinkedEmail ?? null,
        anonymous: result.status.isAnonymous ?? null,
        profileMigrated: result.status.profileMigrated ?? null,
        redirectTo,
      });

      cacheUserId(String(result.status.userId ?? data.session.user.id ?? ""));

      if (typeof window !== "undefined") {
        stripOAuthParamsFromBrowserUrl();
        clearPendingNativeOAuthUrl();
        clearHandledNativeAuthReturnUrl();
        window.location.replace(resolveAppShellReturnTo(redirectTo));
      }

      return { ok: true as const };
    } finally {
      clearAuthCallbackActive();
    }
  };

  completeAuthCallbackInflightKey = callbackKey;
  completeAuthCallbackInflight = run();

  try {
    return await completeAuthCallbackInflight;
  } finally {
    if (completeAuthCallbackInflightKey === callbackKey) {
      completeAuthCallbackInflight = null;
      completeAuthCallbackInflightKey = null;
    }
  }
}

export async function signInWithGoogle(returnTo?: string) {
  if (typeof window === "undefined") {
    return { ok: false as const, error: "not_in_browser" };
  }

  const returnPath = resolveAppShellReturnTo(returnTo ?? defaultAuthCallbackReturnTo());
  stashOAuthReturnTo(returnPath);
  const redirectTo = buildOAuthRedirectUrl();

  console.info(
    "[oauth-start]",
    `isCapacitorNativeApp=${isCapacitorNativeApp()}`,
    `href=${window.location.href}`,
    `redirectTo=${redirectTo}`,
    `returnTo=${returnPath}`
  );

  const session = (await supabaseAuthClient.auth.getSession()).data.session;
  const isAnonymous = session?.user?.is_anonymous === true;

  const oauthOptions = {
    redirectTo,
    skipBrowserRedirect: isCapacitorNativeApp(),
    queryParams: {
      prompt: "select_account",
    },
  };

  const result = isAnonymous && session?.access_token
    ? await supabaseAuthClient.auth.linkIdentity({
        provider: "google",
        options: oauthOptions,
      })
    : await supabaseAuthClient.auth.signInWithOAuth({
        provider: "google",
        options: oauthOptions,
      });

  if (result.error) {
    const message = formatAuthProviderError(result.error.message);
    return {
      ok: false as const,
      error: result.error.message,
      message,
    };
  }

  if (result.data?.url) {
    const authorizeRedirectTo = readRedirectToFromOAuthAuthorizeUrl(
      result.data.url
    );
    console.info(
      "[oauth-start]",
      `authorizeUrlRedirectTo=${authorizeRedirectTo ?? "(missing)"}`
    );

    if (isCapacitorNativeApp()) {
      const browserResult = await openCapacitorOAuthBrowser(result.data.url);
      if (!browserResult.ok) {
        return {
          ok: false as const,
          error: "oauth_callback_failed",
          message:
            browserResult.message ??
            "ログイン処理に失敗しました。もう一度お試しください。",
        };
      }
      if (browserResult.cancelled) {
        return { ok: true as const, mode: isAnonymous ? ("link" as const) : ("oauth" as const) };
      }
    } else {
      window.location.assign(result.data.url);
    }
  }

  return {
    ok: true as const,
    mode: isAnonymous ? ("link" as const) : ("oauth" as const),
  };
}

/** @deprecated メールログインは停止中。Google ログインを使用 */
export async function signInWithMagicLink(email: string, returnTo?: string) {
  return sendAccountMagicLink(email, returnTo);
}

/** 新規登録・ログイン共通のマジックリンク送信（1リクエスト1通まで） */
export async function sendAccountMagicLink(email: string, returnTo?: string) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) {
    return { ok: false as const, error: "email_required" };
  }

  const cooldown = checkAuthEmailResendCooldown(normalized);
  if (!cooldown.ok) {
    return {
      ok: false as const,
      error: "email_rate_limit_exceeded",
      message: authEmailResendCooldownMessage(cooldown.waitSeconds),
    };
  }

  const returnPath = resolveAppShellReturnTo(returnTo ?? defaultAuthCallbackReturnTo());
  const callback = buildAuthCallbackUrl(returnPath);

  const session = (await supabaseAuthClient.auth.getSession()).data.session;
  const isAnonymous = session?.user?.is_anonymous === true;

  if (isAnonymous && session?.access_token) {
    const { error: upgradeError } = await supabaseAuthClient.auth.updateUser(
      { email: normalized },
      { emailRedirectTo: callback }
    );

    if (!upgradeError) {
      markAuthEmailSent(normalized);
      return { ok: true as const, mode: "upgrade" as const, callbackUrl: callback };
    }

    if (isEmailRateLimitError(upgradeError.message)) {
      return {
        ok: false as const,
        error: "email_rate_limit_exceeded",
        message: formatAuthEmailError(upgradeError.message),
      };
    }

    if (!isEmailAlreadyRegisteredError(upgradeError.message)) {
      return {
        ok: false as const,
        error: upgradeError.message,
        message: formatAuthEmailError(upgradeError.message),
      };
    }

    console.info("[auth] email already registered; using magic link login", {
      email: normalized,
    });
  }

  const { error } = await supabaseAuthClient.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: callback,
    },
  });

  if (error) {
    return {
      ok: false as const,
      error: error.message,
      message: formatAuthEmailError(error.message),
    };
  }

  markAuthEmailSent(normalized);
  return { ok: true as const, mode: "otp" as const, callbackUrl: callback };
}

export async function signOutAccount() {
  await supabaseAuthClient.auth.signOut();
  if (typeof window !== "undefined") {
    localStorage.removeItem(USER_ID_CACHE_KEY);
  }
}

export async function fetchAuthStatus(deviceId: string) {
  try {
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

    return {
      ok: true,
      userId: String(json.userId ?? ""),
      deviceId: String(json.deviceId ?? deviceId),
      isAnonymous: Boolean(json.isAnonymous),
      hasLinkedEmail: Boolean(json.hasLinkedEmail),
      email: json.email ?? null,
      entitlements: json.entitlements ?? null,
    };
  } catch {
    return null;
  }
}
