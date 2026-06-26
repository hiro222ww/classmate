"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInWithGoogle } from "@/lib/authClient";
import { sanitizeReturnTo } from "@/lib/authAccount";
import { readOAuthCallbackError } from "@/lib/authProviderErrors";
import { HelpTip } from "@/components/HelpTip";
import { withDev } from "@/lib/withDev";

export default function LoginClient() {
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => {
    const raw =
      searchParams.get("returnTo") ?? searchParams.get("redirect") ?? "/home";
    return sanitizeReturnTo(raw);
  }, [searchParams]);

  const oauthError = useMemo(
    () => readOAuthCallbackError(searchParams),
    [searchParams]
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthError ?? "");

  async function onGoogleLogin() {
    setBusy(true);
    setError("");

    const result = await signInWithGoogle(returnTo);
    if (!result.ok) {
      setError(result.message ?? result.error);
      setBusy(false);
    }
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
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>
          ログイン / 新規登録
        </h1>
        <HelpTip
          label="ログインについて"
          content="Google アカウントでログインします。初めての方も同じボタンから登録できます。ログイン後、元の画面に戻ります。メール送信は使わないため、送信上限の影響を受けません。"
        />
      </header>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => void onGoogleLogin()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "14px 16px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#111827",
            fontWeight: 900,
            fontSize: 15,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              width: 20,
              height: 20,
              borderRadius: 4,
              background:
                "conic-gradient(from 45deg, #ea4335, #fbbc05, #34a853, #4285f4, #ea4335)",
            }}
          />
          {busy ? "Google に移動中…" : "Google で続ける"}
        </button>
      </section>

      {error ? (
        <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700, lineHeight: 1.65 }}>
          {error}
        </p>
      ) : null}

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "#6b7280" }}>
        <Link href={withDev("/home")}>ホームへ戻る</Link>
        {" · "}
        <Link href={withDev("/settings")}>アカウント設定</Link>
      </p>
    </main>
  );
}
