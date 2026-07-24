"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getDeviceId } from "@/lib/device";
import {
  bootstrapAuthSession,
  fetchAuthStatus,
  isAuthCallbackInProgress,
  supabaseAuthClient,
} from "@/lib/authClient";
import {
  AUTH_RESOLVE_SLOW_MS,
  authAccountLabel,
  isAuthLoggedIn,
  isAuthReady,
  resolveAuthStatusFromAccount,
  type AuthAccountSnapshot,
  type AuthStatus,
} from "@/lib/authStatus";

type AuthContextValue = {
  status: AuthStatus;
  ready: boolean;
  loggedIn: boolean;
  account: AuthAccountSnapshot | null;
  accountLabel: string;
  error: string | null;
  slow: boolean;
  refresh: (opts?: { soft?: boolean }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFetchToAccount(
  deviceId: string,
  json: NonNullable<Awaited<ReturnType<typeof fetchAuthStatus>>>
): AuthAccountSnapshot {
  return {
    userId: String(json.userId ?? ""),
    deviceId,
    email: json.email ?? null,
    isAnonymous: Boolean(json.isAnonymous),
    hasLinkedEmail: Boolean(json.hasLinkedEmail),
    entitlements: json.entitlements
      ? {
          plan: String(json.entitlements.plan ?? "free"),
          class_slots: Number(json.entitlements.class_slots ?? 1),
          can_create_classes: Boolean(json.entitlements.can_create_classes),
          topic_plan: Number(json.entitlements.topic_plan ?? 0),
          theme_pass: Boolean(json.entitlements.theme_pass),
        }
      : null,
  };
}

async function accountFromSupabaseSession(
  deviceId: string
): Promise<AuthAccountSnapshot | null> {
  const session = (await supabaseAuthClient.auth.getSession()).data.session;
  if (!session?.user) return null;

  const isAnonymous = session.user.is_anonymous === true;
  return {
    userId: session.user.id,
    deviceId,
    email: session.user.email ?? null,
    isAnonymous,
    hasLinkedEmail: Boolean(session.user.email),
    entitlements: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [account, setAccount] = useState<AuthAccountSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const resolvedOnceRef = useRef(false);
  const refreshGenRef = useRef(0);
  const statusRef = useRef<AuthStatus>("loading");
  statusRef.current = status;

  const applyResolved = useCallback((nextAccount: AuthAccountSnapshot | null) => {
    const next = resolveAuthStatusFromAccount(nextAccount);
    setAccount(nextAccount);
    setStatus(next);
    setError(null);
    setSlow(false);
    resolvedOnceRef.current = true;
  }, []);

  const refresh = useCallback(
    async (opts?: { soft?: boolean }) => {
      const gen = ++refreshGenRef.current;
      const soft = opts?.soft === true || resolvedOnceRef.current;

      if (!soft) {
        setStatus("loading");
        setError(null);
      }

      try {
        if (isAuthCallbackInProgress()) {
          // OAuth / callback in flight — stay loading until session settles.
          if (!resolvedOnceRef.current) {
            setStatus("loading");
          }
          window.setTimeout(() => {
            if (refreshGenRef.current === gen) {
              void refresh({ soft: true });
            }
          }, 500);
          return;
        }

        const deviceId = String(getDeviceId() ?? "").trim();
        if (!deviceId) {
          if (gen !== refreshGenRef.current) return;
          applyResolved(null);
          return;
        }

        await bootstrapAuthSession(deviceId);
        if (gen !== refreshGenRef.current) return;

        const json = await fetchAuthStatus(deviceId);
        if (gen !== refreshGenRef.current) return;

        if (json) {
          applyResolved(mapFetchToAccount(deviceId, json));
          return;
        }

        // API miss: fall back to Supabase session only (never treat profile/API
        // failure as logout when a non-anonymous session exists).
        const fallback = await accountFromSupabaseSession(deviceId);
        if (gen !== refreshGenRef.current) return;

        if (fallback && !fallback.isAnonymous) {
          applyResolved(fallback);
          setError("アカウント情報の一部を取得できませんでした。");
          return;
        }

        applyResolved(
          fallback ?? {
            userId: "",
            deviceId,
            email: null,
            isAnonymous: true,
            hasLinkedEmail: false,
            entitlements: null,
          }
        );
      } catch (e) {
        if (gen !== refreshGenRef.current) return;
        const message =
          e instanceof Error ? e.message : "認証情報の確認に失敗しました。";
        setError(message);

        // Network / unexpected errors must not flash unauthenticated UI.
        if (!resolvedOnceRef.current) {
          setStatus("loading");
          return;
        }

        const deviceId = String(getDeviceId() ?? "").trim();
        if (!deviceId) return;
        const fallback = await accountFromSupabaseSession(deviceId);
        if (gen !== refreshGenRef.current) return;
        if (fallback && !fallback.isAnonymous) {
          setAccount(fallback);
          setStatus("authenticated");
        }
      }
    },
    [applyResolved]
  );

  useEffect(() => {
    void refresh({ soft: false });
  }, [refresh]);

  useEffect(() => {
    if (status !== "loading") {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => {
      if (statusRef.current === "loading") setSlow(true);
    }, AUTH_RESOLVE_SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseAuthClient.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        void refresh({ soft: resolvedOnceRef.current });
      }
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && resolvedOnceRef.current) {
        void refresh({ soft: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => {
    return {
      status,
      ready: isAuthReady(status),
      loggedIn: isAuthLoggedIn(status),
      account,
      accountLabel: authAccountLabel(status, account),
      error,
      slow,
      refresh,
    };
  }, [status, account, error, slow, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

/** Safe for optional trees that may render outside provider in tests. */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
