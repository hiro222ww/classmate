"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device";
import {
  bootstrapAuthSession,
  fetchAuthStatus,
  signOutAccount,
} from "@/lib/authClient";
import {
  accountStatusLabel,
  buildLoginUrl,
  isLoggedInAccount,
} from "@/lib/authAccount";
import { APP_HOME, buildAppLoginUrl } from "@/lib/appShell";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import { withDev } from "@/lib/withDev";

const SUPPORT_EMAIL = "classmate.app.team@gmail.com";

export default function AppSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState<{
    email: string | null;
    isAnonymous: boolean;
    hasLinkedEmail: boolean;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const {
    enabled: notificationsEnabled,
    toggle: toggleNotifications,
    busy: notificationsBusy,
    feedback: notificationsFeedback,
  } = useWebPushNotifications(deviceId, "app-settings");

  async function refreshStatus() {
    setLoading(true);
    setError("");
    try {
      const id = getDeviceId();
      setDeviceId(id);
      if (!id) {
        setStatus(null);
        setError("端末情報を取得できませんでした。");
        return;
      }

      await bootstrapAuthSession(id);
      const json = await fetchAuthStatus(id);
      if (!json) {
        setStatus(null);
        return;
      }

      setStatus({
        email: json.email ?? null,
        isAnonymous: Boolean(json.isAnonymous),
        hasLinkedEmail: Boolean(json.hasLinkedEmail),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function onLogout() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await signOutAccount();
      const id = getDeviceId();
      if (id) {
        await bootstrapAuthSession(id);
      }
      setMessage("ログアウトしました。");
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ログアウトに失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const loggedIn = isLoggedInAccount(status);
  const returnPath = "/app/settings";

  return (
    <main className="app-shell-inner">
      <header>
        <h1 className="app-shell-title">設定</h1>
        <p className="app-shell-subtitle">アカウントとアプリの使い方</p>
      </header>

      {loading ? <p className="app-shell-muted">読み込み中…</p> : null}

      <section className="app-shell-card">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>
          アカウント
        </div>
        {loggedIn ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontWeight: 800 }}>
              {status?.email ?? accountStatusLabel(status)}
            </p>
            <button
              type="button"
              className="app-shell-btn"
              disabled={busy}
              onClick={() => void onLogout()}
            >
              {busy ? "処理中…" : "ログアウト"}
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="app-shell-muted" style={{ margin: 0 }}>
              {accountStatusLabel(status)}
            </p>
            <Link
              href={withDev(buildAppLoginUrl(returnPath))}
              className="app-shell-btn app-shell-btn--primary"
            >
              Google でログイン
            </Link>
          </div>
        )}
      </section>

      <section className="app-shell-card">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>
          通知
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <p className="app-shell-muted" style={{ margin: 0 }}>
            {notificationsFeedback ?? "通話・メッセージのお知らせ"}
          </p>
          <button
            type="button"
            className="app-shell-btn"
            disabled={notificationsBusy || !deviceId}
            onClick={() => void toggleNotifications()}
            style={{ minHeight: 44, padding: "10px 14px" }}
          >
            {notificationsBusy
              ? "処理中…"
              : notificationsEnabled
                ? "ON"
                : "OFF"}
          </button>
        </div>
      </section>

      <section className="app-shell-card">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>
          マイク
        </div>
        <p className="app-shell-muted" style={{ margin: 0 }}>
          通話を始めるときに、iOS のマイク許可を求めます。拒否した場合は「設定」アプリ →
          Classmate からマイクを有効にしてください。
        </p>
      </section>

      <section className="app-shell-card">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>
          安全・法務
        </div>
        <nav aria-label="設定メニュー">
          <ul className="app-shell-list">
            <li>
              <Link href={withDev("/guidelines")} className="app-shell-list-item">
                通報・ブロックについて
                <span className="app-shell-chevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
            <li>
              <Link href={withDev("/terms")} className="app-shell-list-item">
                利用規約
                <span className="app-shell-chevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
            <li>
              <Link href={withDev("/privacy")} className="app-shell-list-item">
                プライバシーポリシー
                <span className="app-shell-chevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
            <li>
              <Link href={withDev("/guidelines")} className="app-shell-list-item">
                コミュニティガイドライン
                <span className="app-shell-chevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          </ul>
        </nav>
      </section>

      <section className="app-shell-card">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>
          アカウント削除
        </div>
        <p className="app-shell-muted" style={{ margin: "0 0 12px" }}>
          アカウント削除のご依頼は、登録メールアドレスを明記のうえお問い合わせください。
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Classmate アカウント削除のご依頼")}`}
          className="app-shell-btn"
        >
          削除を依頼する
        </a>
      </section>

      {message ? (
        <p style={{ margin: 0, color: "#166534", fontWeight: 700 }}>{message}</p>
      ) : null}
      {error ? <p className="app-shell-error">{error}</p> : null}

      <p className="app-shell-muted" style={{ margin: 0, fontSize: 13 }}>
        <Link href={withDev(APP_HOME)}>ホームへ戻る</Link>
        {" · "}
        <Link href={withDev(buildLoginUrl(returnPath))}>Web版ログイン</Link>
      </p>
    </main>
  );
}
