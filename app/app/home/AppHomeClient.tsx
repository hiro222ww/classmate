"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { useAuth } from "@/components/AuthProvider";
import {
  AuthCardSkeleton,
  AuthLoadingBanner,
  AuthTextSkeleton,
} from "@/components/AuthLoadingUI";
import { buildShellAwareLoginUrl } from "@/lib/appShellNavigation";
import { fetchSelfProfile } from "@/lib/fetchCurrentClass";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import { buildThemeSelectPath } from "@/lib/joinMode";
import { withDev } from "@/lib/withDev";
import AppShellPage from "@/components/app-shell/AppShellPage";
import AppShellSection from "@/components/app-shell/AppShellSection";

export default function AppHomeClient() {
  const router = useRouter();
  const { status, loggedIn, accountLabel, slow, error: authError } = useAuth();
  const [hasProfile, setHasProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const id = getDeviceId();
      if (!id) {
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const profile = await fetchSelfProfile(id);
      const name = String(profile.profile?.display_name ?? "").trim();
      setHasProfile(Boolean(name));
      setProfileLoading(false);
    })();
  }, []);

  const returnPath = "/app/home";
  const authLoading = status === "loading";
  const actionsLocked = authLoading;

  return (
    <AppShellPage>
      <header>
        <h1 className="app-shell-title">Classmate</h1>
        <p className="app-shell-subtitle">
          {authLoading ? (
            <AuthTextSkeleton width={180} />
          ) : loggedIn ? (
            profileLoading ? (
              "アカウント情報を読み込んでいます"
            ) : (
              accountLabel
            )
          ) : (
            "Google でログインしてクラスに参加できます"
          )}
        </p>
      </header>

      {authLoading ? (
        <AppShellSection title="アカウント">
          <AuthLoadingBanner
            slow={slow}
            error={authError}
            onReload={() => {
              window.location.reload();
            }}
          />
        </AppShellSection>
      ) : null}

      {!loggedIn && !authLoading ? (
        <AppShellSection title="アカウント">
          <p className="app-shell-muted" style={{ margin: "0 0 12px" }}>
            アカウントを連携すると、クラスや設定を端末間で引き継げます。
          </p>
          <Link
            href={withDev(buildShellAwareLoginUrl(returnPath))}
            className="app-shell-btn app-shell-btn--primary"
            style={{ width: "100%" }}
          >
            Google でログイン
          </Link>
        </AppShellSection>
      ) : null}

      <div className="app-shell-home-layout">
        <AppShellSection title="はじめる">
          {authLoading || profileLoading ? (
            <AuthCardSkeleton />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 4 }}>
                <button
                  type="button"
                  className="app-shell-btn app-shell-btn--primary"
                  disabled={actionsLocked}
                  onClick={() => router.push(withDev("/"))}
                >
                  🎙️ 通話から始める！
                </button>
                <p className="app-shell-muted" style={{ margin: 0, textAlign: "center" }}>
                  今すぐ誰かと話す
                </p>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <button
                  type="button"
                  className="app-shell-btn"
                  disabled={actionsLocked}
                  onClick={() =>
                    router.push(withDev(buildThemeSelectPath("chat")))
                  }
                >
                  💬 チャットから始める！
                </button>
                <p className="app-shell-muted" style={{ margin: 0, textAlign: "center", fontSize: 12 }}>
                  メッセージから気軽に
                </p>
              </div>
              <button
                type="button"
                className="app-shell-btn"
                disabled={actionsLocked}
                onClick={() => router.push(withDev("/class/mine"))}
              >
                マイクラス
              </button>
            </div>
          )}
        </AppShellSection>

        <section className="app-shell-actions app-shell-actions--grid">
          {authLoading || profileLoading ? (
            <AuthCardSkeleton />
          ) : (
            <Link
              href={withDev(buildProfileEditPath(returnPath))}
              className="app-shell-btn"
            >
              {hasProfile ? "プロフィール" : "プロフィール登録"}
            </Link>
          )}
        </section>
      </div>
    </AppShellPage>
  );
}
