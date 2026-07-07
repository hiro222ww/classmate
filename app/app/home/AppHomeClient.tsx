"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import {
  bootstrapAuthSession,
  fetchAuthStatus,
} from "@/lib/authClient";
import { accountStatusLabel, isLoggedInAccount } from "@/lib/authAccount";
import { APP_HOME } from "@/lib/appShell";
import { buildShellAwareLoginUrl } from "@/lib/appShellNavigation";
import { useCurrentClass } from "@/components/dashboard/useCurrentClass";
import { fetchSelfProfile } from "@/lib/fetchCurrentClass";
import { openJoinedClassFromSnapshot } from "@/lib/openJoinedClassClient";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import { withDev } from "@/lib/withDev";
import AppShellPage from "@/components/app-shell/AppShellPage";
import AppShellSection from "@/components/app-shell/AppShellSection";

export default function AppHomeClient() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState("");
  const [accountLabel, setAccountLabel] = useState("未ログイン");
  const [loggedIn, setLoggedIn] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");

  const {
    loading: currentClassLoading,
    current: currentClass,
    hasMembership,
    refresh: refreshCurrentClass,
  } = useCurrentClass(deviceId);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);

    void (async () => {
      if (!id) {
        setReady(true);
        return;
      }

      await bootstrapAuthSession(id);
      const [status, profile] = await Promise.all([
        fetchAuthStatus(id),
        fetchSelfProfile(id),
      ]);

      if (status) {
        const account = {
          isAnonymous: Boolean(status.isAnonymous),
          hasLinkedEmail: Boolean(status.hasLinkedEmail),
          email: status.email ?? null,
        };
        setLoggedIn(isLoggedInAccount(account));
        setAccountLabel(accountStatusLabel(account));
      }

      const name = String(profile.profile?.display_name ?? "").trim();
      setHasProfile(Boolean(name));
      setReady(true);
    })();
  }, []);

  const returnPath = "/app/home";

  async function onEnterClass() {
    if (!currentClass || opening) return;

    setOpening(true);
    setOpenError("");

    const id = String(deviceId || getDeviceId()).trim();
    if (!id) {
      setOpenError("端末情報を取得できませんでした。");
      setOpening(false);
      return;
    }

    const result = await openJoinedClassFromSnapshot({
      deviceId: id,
      current: currentClass,
      withDev,
    });

    if (result.ok) {
      router.push(result.roomPath);
      return;
    }

    setOpenError(result.message);
    void refreshCurrentClass();
    setOpening(false);
  }

  return (
    <AppShellPage>
      <header>
        <h1 className="app-shell-title">Classmate</h1>
        <p className="app-shell-subtitle">
          {loggedIn ? accountLabel : "Google でログインしてクラスに参加できます"}
        </p>
      </header>

      {!loggedIn && ready ? (
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
        <AppShellSection title="今のクラス">
          {currentClassLoading ? (
            <p className="app-shell-muted" style={{ margin: 0 }}>
              読み込み中…
            </p>
          ) : hasMembership && currentClass ? (
            <div style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                {currentClass.name || "参加中のクラス"}
              </p>
              {currentClass.topicTitle ? (
                <p className="app-shell-muted" style={{ margin: 0 }}>
                  {currentClass.topicTitle}
                </p>
              ) : null}
              {currentClass.statusLabel ? (
                <p className="app-shell-muted" style={{ margin: 0 }}>
                  {currentClass.statusLabel}
                </p>
              ) : null}
              <button
                type="button"
                className="app-shell-btn app-shell-btn--primary"
                disabled={opening}
                onClick={() => void onEnterClass()}
              >
                {opening ? "入室中…" : "クラスに戻る"}
              </button>
              {openError ? (
                <p className="app-shell-error" style={{ margin: 0 }}>
                  {openError}
                </p>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <p className="app-shell-muted" style={{ margin: 0 }}>
                まだクラスに参加していません。新しいクラスを探してみましょう。
              </p>
              <button
                type="button"
                className="app-shell-btn app-shell-btn--primary"
                onClick={() => router.push(withDev("/class/select"))}
              >
                新しく参加する
              </button>
            </div>
          )}
        </AppShellSection>

        <section className="app-shell-actions app-shell-actions--grid">
          {hasMembership ? (
            <button
              type="button"
              className="app-shell-btn"
              onClick={() => router.push(withDev("/class/select"))}
            >
              新しく参加する
            </button>
          ) : null}

          <Link
            href={withDev(buildProfileEditPath(returnPath))}
            className="app-shell-btn"
          >
            {hasProfile ? "プロフィール" : "プロフィール登録"}
          </Link>

          {!loggedIn ? (
            <Link
              href={withDev(buildShellAwareLoginUrl(returnPath))}
              className="app-shell-btn"
            >
              ログイン
            </Link>
          ) : null}
        </section>
      </div>
    </AppShellPage>
  );
}
