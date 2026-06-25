"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInWithMagicLink } from "@/lib/authClient";
import { withDev } from "@/lib/withDev";
import { LoginHelpTip } from "@/components/AccountAuthHelp";

function sanitizeRedirect(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/home";
  return raw;
}

export default function LoginClient() {
  const searchParams = useSearchParams();
  const redirectTo = useMemo(
    () => sanitizeRedirect(searchParams.get("redirect")),
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const result = await signInWithMagicLink(email, redirectTo);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    setMessage(
      "ログイン用のリンクをメールで送信しました。メール内のリンクを開くと、この端末で同じアカウントに戻れます。"
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
          別端末から戻る
        </h1>
        <p style={{ margin: "8px 0 0", color: "#6b7280", lineHeight: 1.65 }}>
          すでにメール連携済みのアカウントに、Safari / Chrome / 別端末から戻るときに使います。
        </p>
        <div style={{ marginTop: 8 }}>
          <LoginHelpTip />
        </div>
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
          連携済みのメールアドレス
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
          {busy ? "送信中…" : "ログインリンクを送る"}
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

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 14,
          fontSize: 13,
          lineHeight: 1.65,
          color: "#4b5563",
        }}
      >
        <div style={{ fontWeight: 900, color: "#111827", marginBottom: 6 }}>
          初めての方
        </div>
        ログインは不要です。そのまま利用を始められます。
        <br />
        課金前にメールを登録したい場合は{" "}
        <Link href={withDev("/settings")}>設定ページ</Link>{" "}
        で連携してください。
      </section>

      <p style={{ margin: 0, fontSize: 13 }}>
        <Link href={withDev("/home")}>ホームへ戻る</Link>
      </p>
    </main>
  );
}
