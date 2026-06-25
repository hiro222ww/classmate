"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device";
import {
  bootstrapAuthSession,
  fetchAuthStatus,
  signOutAccount,
} from "@/lib/authClient";
import { withDev } from "@/lib/withDev";
import {
  accountStatusLabel,
  buildLoginUrl,
  isLoggedInAccount,
} from "@/lib/authAccount";
import { isDevFeatureEnabled } from "@/lib/devMode";

type AuthStatus = {
  userId: string;
  deviceId: string;
  isAnonymous: boolean;
  hasLinkedEmail: boolean;
  email: string | null;
  entitlements: {
    plan: string;
    class_slots: number;
    can_create_classes: boolean;
    topic_plan: number;
    theme_pass: boolean;
  } | null;
};

export default function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshStatus() {
    setLoading(true);
    setError("");
    try {
      const deviceId = getDeviceId();
      if (!deviceId) {
        setStatus(null);
        setError("端末情報を取得できませんでした。");
        return;
      }

      await bootstrapAuthSession(deviceId);
      const json = await fetchAuthStatus(deviceId);

      if (!json) {
        setStatus(null);
        return;
      }

      setStatus({
        userId: String(json.userId ?? ""),
        deviceId,
        isAnonymous: Boolean(json.isAnonymous),
        hasLinkedEmail: Boolean(json.hasLinkedEmail),
        email: json.email ?? null,
        entitlements: json.entitlements ?? null,
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
      const deviceId = getDeviceId();
      if (deviceId) {
        await bootstrapAuthSession(deviceId);
      }
      setMessage("ログアウトしました。");
      setStatus(null);
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ログアウトに失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const loggedIn = isLoggedInAccount(status);

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 16,
        display: "grid",
        gap: 16,
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>アカウント設定</h1>
        <p style={{ margin: "8px 0 0", color: "#6b7280", lineHeight: 1.65 }}>
          ログイン状態の確認、ログアウト、課金管理への導線です。
        </p>
      </header>

      {loading ? <p>読み込み中…</p> : null}

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>アカウント</div>

        {loggedIn ? (
          <>
            <p style={{ margin: 0, fontSize: 14, color: "#111827", fontWeight: 800 }}>
              {status?.email ?? accountStatusLabel(status)}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onLogout()}
              style={{
                width: "fit-content",
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 800,
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "処理中…" : "ログアウト"}
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.65 }}>
              現在: {accountStatusLabel(status)}
            </p>
            <Link
              href={withDev(buildLoginUrl("/settings"))}
              style={{
                display: "inline-block",
                width: "fit-content",
                padding: "12px 14px",
                borderRadius: 12,
                background: "#111827",
                color: "#fff",
                fontWeight: 900,
                textDecoration: "none",
              }}
            >
              ログイン / 新規登録
            </Link>
          </>
        )}
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>課金</div>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.65 }}>
          プランの確認・変更、支払い管理はこちらから行えます。
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href={withDev("/premium")}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              fontWeight: 800,
              textDecoration: "none",
              color: "#111",
            }}
          >
            プラン
          </Link>
          <Link
            href={withDev("/billing")}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              fontWeight: 800,
              textDecoration: "none",
              color: "#111",
            }}
          >
            お支払い管理
          </Link>
        </div>
      </section>

      {isDevFeatureEnabled() && status ? (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 16,
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          <div style={{ fontWeight: 900, color: "#111827", marginBottom: 8 }}>
            開発者向け
          </div>
          <div>userId: {status.userId || "-"}</div>
          <div>deviceId: {status.deviceId || "-"}</div>
        </section>
      ) : null}

      {message ? (
        <p style={{ margin: 0, color: "#166534", fontWeight: 700 }}>{message}</p>
      ) : null}
      {error ? (
        <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{error}</p>
      ) : null}

      <p style={{ margin: 0, fontSize: 13 }}>
        <Link href={withDev("/profile")}>プロフィール編集</Link>
        {" · "}
        <Link href={withDev("/home")}>ホーム</Link>
      </p>
    </main>
  );
}
