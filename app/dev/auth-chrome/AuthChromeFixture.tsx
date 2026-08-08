"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HelpTip } from "@/components/HelpTip";
import { AuthLoadingBanner } from "@/components/AuthLoadingUI";
import { LOGIN_REQUIRED_MESSAGE } from "@/lib/authAccount";

export type AuthChromeScene =
  | "login"
  | "google"
  | "busy"
  | "error"
  | "callback"
  | "callback_error"
  | "restore"
  | "login_required"
  | "auth_loading";

/**
 * Presentational auth chrome for local screenshots.
 * No OAuth / magic-link / email send / session writes.
 *
 * Note: production login UI is Google-only (magic-link form is stopped).
 */
export default function AuthChromeFixture() {
  const searchParams = useSearchParams();
  const scene = (searchParams.get("scene") as AuthChromeScene) || "login";

  const busy = scene === "busy" || scene === "google";
  const error =
    scene === "error"
      ? "ログインに失敗しました。もう一度 Google でログインしてください。"
      : "";

  if (scene === "callback" || scene === "callback_error" || scene === "restore") {
    const isError = scene !== "callback";
    const hint =
      scene === "restore"
        ? "この端末でアカウントを復元するには、ログインが必要です。"
        : "";
    const errText =
      scene === "restore"
        ? "参加するにはプロフィール登録が必要です"
        : scene === "callback_error"
          ? "ログイン処理に失敗しました。"
          : "";

    return (
      <main
        className="cm-classroom-scope cm-auth-root cm-auth-callback"
        data-cm-auth={
          scene === "callback" ? "processing" : scene === "restore" ? "restore" : "error"
        }
        style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}
      >
        <div
          className="cm-paper-card cm-auth-card"
          style={{ padding: 16, display: "grid", gap: 12 }}
        >
          <h1
            className="cm-section-title"
            style={{ margin: 0, fontSize: 24, fontWeight: 900 }}
          >
            ログイン処理中…
          </h1>
          {isError ? (
            <>
              {hint ? (
                <p
                  className="cm-call-banner cm-call-banner--warn cm-auth-hint"
                  style={{ color: "#92400e", lineHeight: 1.65, fontWeight: 700 }}
                >
                  {hint}
                </p>
              ) : null}
              <p
                className="cm-home-error cm-auth-error"
                style={{ color: "#b91c1c", lineHeight: 1.65 }}
              >
                {errText}
              </p>
              <p className="cm-auth-footer" style={{ fontSize: 13 }}>
                <Link href="#">ログイン画面へ戻る</Link>
                {hint ? (
                  <>
                    {" · "}
                    <Link href="#">プロフィール登録</Link>
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p
              className="cm-home-loading-line cm-auth-processing"
              style={{ color: "#6b7280", lineHeight: 1.65 }}
            >
              セッションを確認しています。しばらくお待ちください。
            </p>
          )}
        </div>
      </main>
    );
  }

  if (scene === "auth_loading" || scene === "login_required") {
    return (
      <main
        className="cm-classroom-scope cm-auth-root"
        style={{ maxWidth: 520, margin: "0 auto", padding: 24, display: "grid", gap: 16 }}
      >
        <AuthLoadingBanner
          slow={false}
          error={scene === "login_required" ? LOGIN_REQUIRED_MESSAGE : null}
          onReload={scene === "login_required" ? () => undefined : undefined}
        />
      </main>
    );
  }

  return (
    <main
      className="cm-classroom-scope cm-auth-root"
      data-cm-auth={busy ? "busy" : error ? "error" : "idle"}
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: 24,
        display: "grid",
        gap: 16,
      }}
    >
      <header
        className="cm-auth-header"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <h1
          className="cm-section-title"
          style={{ margin: 0, fontSize: 28, fontWeight: 900 }}
        >
          ログイン / 新規登録
        </h1>
        <HelpTip
          label="ログインについて"
          content="Google アカウントでログインします。初めての方も同じボタンから登録できます。ログイン後、元の画面に戻ります。メール送信は使わないため、送信上限の影響を受けません。"
        />
      </header>

      <section
        className="cm-paper-card cm-auth-card"
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
          className="cm-auth-google"
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
      </section>

      {error ? (
        <p
          className="cm-home-error cm-auth-error"
          style={{
            margin: 0,
            color: "#b91c1c",
            fontWeight: 700,
            lineHeight: 1.65,
          }}
        >
          {error}
        </p>
      ) : null}

      <p
        className="cm-auth-footer"
        style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "#6b7280" }}
      >
        <Link href="#">ホームへ戻る</Link>
        {" · "}
        <Link href="#">アカウント設定</Link>
      </p>
    </main>
  );
}
