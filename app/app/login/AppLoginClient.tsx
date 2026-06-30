"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInWithGoogle } from "@/lib/authClient";
import { sanitizeReturnTo } from "@/lib/authAccount";
import { readOAuthCallbackError } from "@/lib/authProviderErrors";
import { APP_HOME } from "@/lib/appShell";
import { withDev } from "@/lib/withDev";

export default function AppLoginClient() {
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => {
    const raw = searchParams.get("returnTo") ?? APP_HOME;
    return sanitizeReturnTo(raw, APP_HOME);
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
    <main className="app-shell-inner">
      <header>
        <h1 className="app-shell-title">ログイン</h1>
        <p className="app-shell-subtitle">
          Google アカウントで Classmate を続けます
        </p>
      </header>

      <section className="app-shell-card" style={{ display: "grid", gap: 12 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onGoogleLogin()}
          className="app-shell-btn"
          style={{ justifyContent: "flex-start" }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              width: 22,
              height: 22,
              borderRadius: 4,
              flexShrink: 0,
              background:
                "conic-gradient(from 45deg, #ea4335, #fbbc05, #34a853, #4285f4, #ea4335)",
            }}
          />
          {busy ? "Google に移動中…" : "Google で続ける"}
        </button>

        <button
          type="button"
          disabled
          className="app-shell-btn app-shell-btn--ghost"
          style={{ justifyContent: "flex-start" }}
          aria-disabled
        >
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              width: 22,
              height: 22,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              background: "#e2e8f0",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            
          </span>
          Apple で続ける（準備中）
        </button>
      </section>

      {error ? <p className="app-shell-error">{error}</p> : null}

      <p className="app-shell-muted" style={{ margin: 0, fontSize: 13 }}>
        <Link href={withDev(APP_HOME)}>ホームへ戻る</Link>
        {" · "}
        <Link href={withDev(`/login?returnTo=${encodeURIComponent(returnTo)}`)}>
          メールでログイン
        </Link>
      </p>
    </main>
  );
}
