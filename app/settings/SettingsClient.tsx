"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device";
import {
  bootstrapAuthSession,
  getAuthAccessToken,
  linkEmailAddress,
  supabaseAuthClient,
} from "@/lib/authClient";
import { anonymousUserNotice } from "@/lib/userIdentity";
import { withDev } from "@/lib/withDev";

type AuthStatus = {
  userId: string;
  deviceId: string;
  isAnonymous: boolean;
  hasLinkedEmail: boolean;
  email: string | null;
};

export default function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshStatus() {
    setLoading(true);
    setError("");
    try {
      const deviceId = getDeviceId();
      await bootstrapAuthSession(deviceId);

      const token = await getAuthAccessToken();
      if (!token) {
        setStatus(null);
        setError("認証セッションを開始できませんでした。");
        return;
      }

      const res = await fetch("/api/auth/session", {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          "x-device-id": deviceId,
        },
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "認証状態の取得に失敗しました。");
        return;
      }

      setStatus({
        userId: String(json.userId ?? ""),
        deviceId,
        isAnonymous: Boolean(json.isAnonymous),
        hasLinkedEmail: Boolean(json.hasLinkedEmail),
        email: json.email ?? null,
      });
    } catch (e: any) {
      setError(e?.message ?? "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function onLinkEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const deviceId = getDeviceId();
      const clientResult = await linkEmailAddress(email.trim());
      if (!clientResult.ok) {
        setError(clientResult.error);
        return;
      }

      setMessage(
        "確認メールを送信しました。メール内のリンクを開くと、アカウント連携が完了します。"
      );
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function onSignOutDevicesOnly() {
    setBusy(true);
    setError("");
    try {
      await supabaseAuthClient.auth.signOut();
      setMessage("この端末の認証セッションを終了しました。次回アクセス時に新しいゲストセッションが作成されます。");
      setStatus(null);
    } catch (e: any) {
      setError(e?.message ?? "サインアウトに失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const notice = status
    ? anonymousUserNotice(status.isAnonymous, status.hasLinkedEmail)
    : null;

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
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>設定</h1>
        <p style={{ margin: "8px 0 0", color: "#6b7280", lineHeight: 1.65 }}>
          アカウント連携や端末情報を管理します。
        </p>
      </header>

      {loading ? <p>読み込み中…</p> : null}

      {notice ? (
        <section
          style={{
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
            borderRadius: 16,
            padding: 14,
            lineHeight: 1.65,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {notice}
        </section>
      ) : null}

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>アカウント連携</div>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.65 }}>
          メールアドレスを連携すると、Safari / Chrome / 別端末でも同じプロフィール・プラン・参加履歴を復元しやすくなります。
          初回利用時にログインは不要で、ゲスト利用のまま始められます。
        </p>

        {status?.hasLinkedEmail ? (
          <p style={{ margin: 0, fontSize: 13, color: "#166534", fontWeight: 800 }}>
            連携済み: {status.email}
          </p>
        ) : (
          <form onSubmit={onLinkEmail} style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              メールアドレス
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                }}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                background: "#111827",
                color: "#fff",
                fontWeight: 900,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "送信中…" : "メールで連携する"}
            </button>
          </form>
        )}
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 10,
          fontSize: 13,
          color: "#4b5563",
        }}
      >
        <div style={{ fontWeight: 900, color: "#111827" }}>端末情報</div>
        <div>
          端末ID（通話・presence用）:
          <code style={{ marginLeft: 6 }}>{status?.deviceId ?? "-"}</code>
        </div>
        <div>
          ユーザーID:
          <code style={{ marginLeft: 6 }}>{status?.userId ?? "-"}</code>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSignOutDevicesOnly()}
          style={{
            width: "fit-content",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontWeight: 800,
            cursor: busy ? "default" : "pointer",
          }}
        >
          この端末の認証セッションを終了
        </button>
      </section>

      {message ? (
        <p style={{ margin: 0, color: "#166534", fontWeight: 700 }}>{message}</p>
      ) : null}
      {error ? (
        <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{error}</p>
      ) : null}

        <p style={{ margin: "8px 0 0", fontSize: 13 }}>
          <Link href={withDev("/login")}>別端末からログイン</Link>
          {" · "}
          <Link href={withDev("/profile")}>プロフィール編集</Link>
          {" · "}
          <Link href={withDev("/premium")}>プラン</Link>
        </p>
    </main>
  );
}
