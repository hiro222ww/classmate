"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device";
import {
  bootstrapAuthSession,
  fetchAuthStatus,
  signOutAccount,
} from "@/lib/authClient";
import {
  accountStatusLabel,
  isLoggedInAccount,
} from "@/lib/authAccount";
import { APP_HOME, buildAppLoginUrl } from "@/lib/appShell";
import {
  summarizeAppEntitlements,
  type AppEntitlements,
} from "@/lib/appEntitlementsDisplay";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import { withDev } from "@/lib/withDev";
import AppShellPage from "@/components/app-shell/AppShellPage";
import AppShellSection from "@/components/app-shell/AppShellSection";
import AppShellListLink from "@/components/app-shell/AppShellListLink";

const SUPPORT_EMAIL = "classmate.app.team@gmail.com";

export default function AppSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [entitlements, setEntitlements] = useState<AppEntitlements | null>(
    null
  );
  const [status, setStatus] = useState<{
    email: string | null;
    isAnonymous: boolean;
    hasLinkedEmail: boolean;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const returnPath = "/app/settings";
  const billingReturn = encodeURIComponent(returnPath);

  async function refreshStatus() {
    setLoading(true);
    setError("");
    try {
      const id = getDeviceId();
      setDeviceId(id);
      if (!id) {
        setStatus(null);
        setEntitlements(null);
        setError("端末情報を取得できませんでした。");
        return;
      }

      await bootstrapAuthSession(id);
      const json = await fetchAuthStatus(id);
      if (!json) {
        setStatus(null);
        setEntitlements(null);
        return;
      }

      setStatus({
        email: json.email ?? null,
        isAnonymous: Boolean(json.isAnonymous),
        hasLinkedEmail: Boolean(json.hasLinkedEmail),
      });

      if (json.entitlements) {
        setEntitlements({
          plan: String(json.entitlements.plan ?? "free"),
          class_slots: Number(json.entitlements.class_slots ?? 1),
          can_create_classes: Boolean(json.entitlements.can_create_classes),
          topic_plan: Number(json.entitlements.topic_plan ?? 0),
          theme_pass: Boolean(json.entitlements.theme_pass),
        });
      } else {
        setEntitlements(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
      setStatus(null);
      setEntitlements(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  const loggedIn = isLoggedInAccount(status);
  const summary = useMemo(
    () => summarizeAppEntitlements(entitlements),
    [entitlements]
  );

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

  async function onSyncEntitlements() {
    if (!deviceId) return;
    setSyncBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await authenticatedFetch("/api/billing/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(String(json?.error ?? "権限の再同期に失敗しました。"));
        return;
      }
      setMessage("権限を再同期しました。");
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "権限の再同期に失敗しました。");
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <AppShellPage wide>
      <header className="app-shell-card--full">
        <h1 className="app-shell-title">設定</h1>
        <p className="app-shell-subtitle">アカウント、課金、通知、安全</p>
      </header>

      {loading ? <p className="app-shell-muted">読み込み中…</p> : null}

      <div className="app-shell-settings-grid">
        <AppShellSection title="アカウント">
          {loggedIn ? (
            <div style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 800 }}>
                {status?.email ?? accountStatusLabel(status)}
              </p>
              <Link
                href={withDev(buildProfileEditPath(returnPath))}
                className="app-shell-btn"
              >
                プロフィール
              </Link>
              <button
                type="button"
                className="app-shell-btn"
                disabled={busy}
                onClick={() => void onLogout()}
              >
                {busy ? "処理中…" : "ログアウト"}
              </button>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Classmate アカウント削除のご依頼")}`}
                className="app-shell-btn app-shell-btn--ghost"
              >
                アカウント削除を依頼
              </a>
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
        </AppShellSection>

        <AppShellSection
          title="課金・プラン"
          subtitle="Web版と同じ Stripe 課金体系を利用します（App Store 提出前に IAP 検討が必要になる可能性があります）"
        >
          <div className="app-shell-stat-grid" style={{ marginBottom: 12 }}>
            <div className="app-shell-stat">
              <div className="app-shell-stat-label">現在のプラン</div>
              <div className="app-shell-stat-value">{summary.planLabel}</div>
            </div>
            <div className="app-shell-stat">
              <div className="app-shell-stat-label">クラス枠</div>
              <div className="app-shell-stat-value">{summary.classSlotsLabel}</div>
            </div>
            <div className="app-shell-stat">
              <div className="app-shell-stat-label">テーマ</div>
              <div className="app-shell-stat-value">{summary.topicLabel}</div>
            </div>
            <div className="app-shell-stat">
              <div className="app-shell-stat-label">テーマ支援</div>
              <div className="app-shell-stat-value">{summary.themeLabel}</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <Link
              href={withDev(`/premium?returnTo=${billingReturn}`)}
              className="app-shell-btn"
            >
              プラン変更
            </Link>
            <Link
              href={withDev(`/billing?returnTo=${billingReturn}`)}
              className="app-shell-btn"
            >
              請求管理
            </Link>
            <button
              type="button"
              className="app-shell-btn app-shell-btn--ghost"
              disabled={syncBusy || !loggedIn}
              onClick={() => void onSyncEntitlements()}
            >
              {syncBusy ? "再同期中…" : "権限を再同期"}
            </button>
          </div>
        </AppShellSection>

        <AppShellSection
          title="通知・通話"
          subtitle="iOS アプリ通知は将来 APNs で実装予定です"
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div className="app-shell-info-box">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontWeight: 800 }}>アプリ通知</span>
                <span className="app-shell-badge">準備中</span>
              </div>
              <p className="app-shell-muted" style={{ margin: 0 }}>
                通話リクエストやクラス参加などの通知は、Apple Developer Program
                加入後に APNs で提供予定です。Web Push とは別の仕組みになります。
              </p>
            </div>
            <div className="app-shell-info-box">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>マイク設定</div>
              <p className="app-shell-muted" style={{ margin: 0 }}>
                通話開始時に iOS のマイク許可を求めます。拒否した場合は iOS
                の「設定」アプリ → Classmate からマイクを有効にしてください。
              </p>
            </div>
            <div className="app-shell-info-box">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>通話の注意</div>
              <p className="app-shell-muted" style={{ margin: 0 }}>
                通話中は他アプリへの切り替えや画面ロックに注意してください。安定性のため、通話画面の UI
                は既存 Web 版をそのまま利用しています。
              </p>
            </div>
          </div>
        </AppShellSection>

        <AppShellSection title="安全">
          <nav aria-label="安全">
            <ul className="app-shell-list">
              <AppShellListLink
                href={withDev("/guidelines")}
                label="通報"
                detail="ルーム・通話画面から利用できます"
              />
              <AppShellListLink
                href={withDev("/guidelines")}
                label="ブロック"
                detail="相手のプロフィールや通話画面から設定できます"
              />
              <AppShellListLink
                href={withDev("/guidelines")}
                label="コミュニティガイドライン"
              />
            </ul>
          </nav>
        </AppShellSection>

        <AppShellSection title="法務・サポート" className="app-shell-card--full">
          <nav aria-label="法務・サポート">
            <ul className="app-shell-list">
              <AppShellListLink href={withDev("/terms")} label="利用規約" />
              <AppShellListLink
                href={withDev("/privacy")}
                label="プライバシーポリシー"
              />
              <AppShellListLink
                href={withDev("/legal/commercial-disclosure")}
                label="特定商取引法に基づく表記"
              />
              <AppShellListLink
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Classmate iOS お問い合わせ")}`}
                label="お問い合わせ"
                detail={SUPPORT_EMAIL}
                external
              />
            </ul>
          </nav>
        </AppShellSection>
      </div>

      {message ? (
        <p style={{ margin: 0, color: "#166534", fontWeight: 700 }}>{message}</p>
      ) : null}
      {error ? <p className="app-shell-error">{error}</p> : null}

      <p className="app-shell-muted" style={{ margin: 0, fontSize: 13 }}>
        <Link href={withDev(APP_HOME)}>ホームへ戻る</Link>
      </p>
    </AppShellPage>
  );
}
