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
import { APP_LOGIN, APP_SETTINGS, buildAppLoginUrl } from "@/lib/appShell";
import { useCurrentClass } from "@/components/dashboard/useCurrentClass";
import { fetchSelfProfile } from "@/lib/fetchCurrentClass";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import { PushNotificationBell } from "@/components/PushNotificationBell";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import { withDev } from "@/lib/withDev";

export default function AppHomeClient() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState("");
  const [accountLabel, setAccountLabel] = useState("未ログイン");
  const [loggedIn, setLoggedIn] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [ready, setReady] = useState(false);

  const {
    loading: currentClassLoading,
    current: currentClass,
    hasMembership,
  } = useCurrentClass(deviceId);

  const {
    enabled: notificationsEnabled,
    toggle: toggleNotifications,
    busy: notificationsBusy,
    feedback: notificationsFeedback,
  } = useWebPushNotifications(deviceId, "app-home");

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

  const enterClassHref = useMemo(() => {
    if (!currentClass?.classId) return null;
    const params = new URLSearchParams({
      autojoin: "1",
      classId: currentClass.classId,
    });
    if (currentClass.sessionId) {
      params.set("sessionId", currentClass.sessionId);
    }
    return withDev(`/room?${params.toString()}`);
  }, [currentClass]);

  return (
    <main className="app-shell-inner">
      <header>
        <h1 className="app-shell-title">Classmate</h1>
        <p className="app-shell-subtitle">
          {loggedIn ? accountLabel : "Google でログインしてクラスに参加できます"}
        </p>
      </header>

      {!loggedIn && ready ? (
        <section className="app-shell-card">
          <p className="app-shell-muted" style={{ margin: "0 0 12px" }}>
            アカウントを連携すると、クラスや通知を端末間で引き継げます。
          </p>
          <Link
            href={withDev(buildAppLoginUrl(returnPath))}
            className="app-shell-btn app-shell-btn--primary"
            style={{ width: "100%" }}
          >
            Google でログイン
          </Link>
        </section>
      ) : null}

      <section className="app-shell-card">
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>今のクラス</div>
          {currentClassLoading ? (
            <p className="app-shell-muted" style={{ margin: 0 }}>
              読み込み中…
            </p>
          ) : hasMembership && currentClass ? (
            <>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
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
                disabled={!enterClassHref}
                onClick={() => {
                  if (enterClassHref) router.push(enterClassHref);
                }}
              >
                クラスに戻る
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </section>

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

        <div
          className="app-shell-card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            boxShadow: "none",
          }}
        >
          <div>
            <div style={{ fontWeight: 800 }}>通知</div>
            <div className="app-shell-muted" style={{ fontSize: 13 }}>
              {notificationsFeedback ?? "通話・メッセージのお知らせ"}
            </div>
          </div>
          <PushNotificationBell
            enabled={notificationsEnabled}
            busy={notificationsBusy}
            feedback={null}
            onToggle={() => void toggleNotifications()}
          />
        </div>

        <Link
          href={withDev(buildProfileEditPath(returnPath))}
          className="app-shell-btn"
        >
          {hasProfile ? "プロフィール" : "プロフィール登録"}
        </Link>

        <Link href={withDev(APP_SETTINGS)} className="app-shell-btn">
          設定
        </Link>
      </section>

      {!loggedIn ? (
        <p className="app-shell-muted" style={{ margin: 0, fontSize: 13 }}>
          <Link href={withDev(APP_LOGIN)}>ログイン画面へ</Link>
        </p>
      ) : null}
    </main>
  );
}
