"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { sendAccountMagicLink } from "@/lib/authClient";
import { sanitizeReturnTo } from "@/lib/authAccount";
import { withDev } from "@/lib/withDev";

export default function LoginClient() {
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => {
    const raw =
      searchParams.get("returnTo") ?? searchParams.get("redirect") ?? "/home";
    return sanitizeReturnTo(raw);
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const result = await sendAccountMagicLink(email, returnTo);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    setMessage(
      result.mode === "upgrade"
        ? "確認メールを送信しました。メール内のリンクを開くと、アカウント登録が完了します。"
        : "ログイン用のリンクをメールで送信しました。メール内のリンクを開いてください。"
    );
    setBusy(false);
  }

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: 24,
        display: "grid",
        gap: 16,
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>
          ログイン / 新規登録
        </h1>
        <p style={{ margin: "8px 0 0", color: "#6b7280", lineHeight: 1.65 }}>
          メールアドレスを入力してください。アカウントがなければ作成され、あればログインできます。
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
          メールアドレス
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
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
          {busy ? "送信中…" : "メールで続ける"}
        </button>
      </form>

      {message ? (
        <p
          style={{
            margin: 0,
            color: "#166534",
            fontWeight: 700,
            lineHeight: 1.65,
          }}
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{error}</p>
      ) : null}

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "#6b7280" }}>
        ログイン後、元の画面に戻ります。
        <br />
        <Link href={withDev("/home")}>ホームへ戻る</Link>
        {" · "}
        <Link href={withDev("/settings")}>アカウント設定</Link>
      </p>
    </main>
  );
}
