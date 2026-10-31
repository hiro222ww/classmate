"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  bootstrapAuthSession,
  fetchAuthStatus,
  getAuthAccessToken,
  signInWithGoogle,
} from "@/lib/authClient";
import { isLoggedInAccount, sanitizeReturnTo } from "@/lib/authAccount";
import { readOAuthCallbackError } from "@/lib/authProviderErrors";
import { APP_HOME, APP_LOGIN } from "@/lib/appShell";
import {
  defaultAuthCallbackReturnTo,
  isAppShellContext,
  resolveAppShellReturnTo,
} from "@/lib/appShellContext";
import {
  buildShellAwareSettingsUrl,
} from "@/lib/appShellNavigation";
import {
  isCapacitorNativeApp,
  retryPendingNativeAuthReturn,
} from "@/lib/capacitorClient";
import { isCapacitorOAuthBrowserOpen } from "@/lib/capacitorOAuthBrowser";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";
import { HelpTip } from "@/components/HelpTip";
import AppShellPage from "@/components/app-shell/AppShellPage";
import { ClassmateEmblem } from "@/components/brand/ClassmateEmblem";
import { HomeBrandVisual } from "@/components/brand/HomeBrandVisual";

function GoogleLoginButton({
  busy,
  onClick,
  className,
  style,
}: {
  busy: boolean;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={className}
      style={style}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          width: 22,
          height: 22,
          borderRadius: 4,
          flexShrink: 0,
          background:
            "conic-gradient(from 45deg, #ea4335, #fbbc05, #34a853, #4285f4, #ea4335)",
        }}
      />
      {busy ? "Google に移動中…" : "Google で続ける"}
    </button>
  );
}

export default function UserLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isApp = isAppShellContext();

  const returnTo = useMemo(() => {
    const raw =
      searchParams.get("returnTo") ??
      searchParams.get("redirect") ??
      defaultAuthCallbackReturnTo();
    return isApp
      ? resolveAppShellReturnTo(raw, APP_HOME)
      : sanitizeReturnTo(raw);
  }, [isApp, searchParams]);

  const oauthError = useMemo(
    () => readOAuthCallbackError(searchParams),
    [searchParams]
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthError ?? "");

  useEffect(() => {
    if (!isApp && !isCapacitorNativeApp()) return;

    let cancelled = false;

    const recoverAfterOAuthReturn = async () => {
      if (isCapacitorOAuthBrowserOpen()) {
        return;
      }

      setBusy(false);

      if (isCapacitorNativeApp()) {
        if (retryPendingNativeAuthReturn()) {
          return;
        }
      }

      const deviceId = getDeviceId();
      if (!deviceId) return;

      const token = await getAuthAccessToken();
      if (!token) return;

      await bootstrapAuthSession(deviceId);
      const status = await fetchAuthStatus(deviceId);
      if (cancelled) return;

      if (isLoggedInAccount(status)) {
        router.replace(withDev(returnTo));
      }
    };

    void recoverAfterOAuthReturn();

    const onBrowserFinished = () => {
      setBusy(false);
      void recoverAfterOAuthReturn();
    };
    window.addEventListener("classmate-oauth-browser-finished", onBrowserFinished);

    const onVisible = () => {
      if (!document.hidden && !isCapacitorOAuthBrowserOpen()) {
        void recoverAfterOAuthReturn();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    let removeStateListener: (() => void) | undefined;
    if (isCapacitorNativeApp()) {
      void import("@capacitor/app").then(({ App }) => {
        void App.addListener("appStateChange", (state) => {
          if (state.isActive && !isCapacitorOAuthBrowserOpen()) {
            void recoverAfterOAuthReturn();
          }
        }).then((listener) => {
          removeStateListener = () => {
            void listener.remove();
          };
        });
      });
    }

    return () => {
      cancelled = true;
      window.removeEventListener(
        "classmate-oauth-browser-finished",
        onBrowserFinished
      );
      document.removeEventListener("visibilitychange", onVisible);
      removeStateListener?.();
    };
  }, [isApp, returnTo, router]);

  async function onGoogleLogin() {
    setBusy(true);
    setError("");

    const result = await signInWithGoogle(returnTo);
    if (!result.ok) {
      setError(result.message ?? result.error);
      setBusy(false);
    }
  }

  const homeHref = withDev(isApp ? APP_HOME : "/");
  const settingsHref = withDev(buildShellAwareSettingsUrl());

  if (isApp) {
    return (
      <AppShellPage showBottomNav={false}>
        <div
          className="cm-classroom-scope cm-auth-root cm-auth-root--app"
          data-cm-auth={busy ? "busy" : error ? "error" : "idle"}
        >
          <div style={{ marginBottom: 12 }}>
            <HomeBrandVisual />
          </div>

          <header className="cm-page-heading">
            <h1 className="app-shell-title cm-section-title">ログイン</h1>
          </header>

          <section
            className="app-shell-card cm-paper-card cm-auth-card"
            style={{ display: "grid", gap: 12 }}
          >
            <div className="cm-auth-card-emblem">
              <ClassmateEmblem size="md" decorative />
            </div>
            <GoogleLoginButton
              busy={busy}
              onClick={() => void onGoogleLogin()}
              className="app-shell-btn cm-auth-google"
              style={{ justifyContent: "flex-start" }}
            />
          </section>

          {error ? (
            <p className="app-shell-error cm-home-error cm-auth-error">{error}</p>
          ) : null}

          {busy ? (
            <p
              className="app-shell-muted cm-home-loading-line cm-auth-busy-note"
              style={{ margin: 0, fontSize: 13 }}
            >
              認証後にアプリへ戻ってもこの画面のままの場合は、一度アプリを閉じて開き直すか、下のリンクからホームへ戻ってください。
            </p>
          ) : null}

          <p className="app-shell-muted cm-auth-footer" style={{ margin: 0, fontSize: 13 }}>
            <Link href={homeHref}>ホームへ戻る</Link>
          </p>
        </div>
      </AppShellPage>
    );
  }

  return (
    <main
      className="cm-classroom-scope cm-auth-root"
      data-cm-auth={busy ? "busy" : error ? "error" : "idle"}
      style={{
        maxWidth: 440,
        margin: "0 auto",
        padding: "20px 16px 28px",
        display: "grid",
        gap: 14,
      }}
    >
      <HomeBrandVisual showIntro={false} />

      <header
        className="cm-auth-header cm-page-heading"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <h1>ログイン</h1>
        <HelpTip
          label="ログインについて"
          content="Google でログイン・登録できます。完了後、元の画面に戻ります。"
        />
      </header>

      <section
        className="cm-paper-card cm-auth-card"
        style={{
          display: "grid",
          gap: 10,
        }}
      >
        <GoogleLoginButton
          busy={busy}
          onClick={() => void onGoogleLogin()}
          className="cm-auth-google"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid var(--cm-border)",
            background: "#fff",
            color: "var(--cm-text)",
            fontWeight: 900,
            fontSize: 15,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
            minHeight: 52,
          }}
        />
      </section>

      {error ? (
        <p
          className="cm-home-error cm-auth-error"
          style={{
            margin: 0,
            color: "#b91c1c",
            fontWeight: 700,
            lineHeight: 1.65,
          }}
        >
          {error}
        </p>
      ) : null}

      <p
        className="cm-auth-footer"
        style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "#6b7280" }}
      >
        <Link href={homeHref}>ホームへ戻る</Link>
        {" · "}
        <Link href={settingsHref}>アカウント設定</Link>
      </p>
    </main>
  );
}

/** Web /login からアプリ文脈のユーザーを /app/login へ寄せる */
export function LoginRouteGuard({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (!isAppShellContext()) return;

    const query = searchParams.toString();
    const target = query ? `${APP_LOGIN}?${query}` : APP_LOGIN;
    router.replace(withDev(target));
  }, [router, searchParams]);

  if (isAppShellContext()) {
    return <p style={{ padding: 24 }}>読み込み中…</p>;
  }

  return <>{children}</>;
}
