"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SectionTitle } from "@/components/FormFieldLabel";
import { HelpTip } from "@/components/HelpTip";

export type SettingsChromeScene =
  | "default"
  | "loading"
  | "error"
  | "unlinked"
  | "linked"
  | "notify_default"
  | "notify_granted"
  | "notify_denied";

/**
 * Presentational settings chrome for local screenshots.
 * Dummy state only — no Auth / notification permission / API writes.
 */
export default function SettingsChromeFixture() {
  const searchParams = useSearchParams();
  const scene = (searchParams.get("scene") as SettingsChromeScene) || "default";

  const loading = scene === "loading";
  const linked =
    scene === "linked" ||
    scene === "notify_granted" ||
    scene === "notify_default" ||
    scene === "default" ||
    scene === "error";
  const unlinked = scene === "unlinked" || scene === "notify_denied";
  const emailEnabled = scene === "notify_granted";
  const canConfigure = linked && !loading;
  const notifyState = !canConfigure
    ? "needs-login"
    : loading
      ? "loading"
      : emailEnabled
        ? "enabled"
        : "disabled";
  /** Presentational only: maps fixture scenes to email-pref surfaces. */
  const showDeniedGate = scene === "notify_denied" || unlinked;

  return (
    <main
      className="cm-classroom-scope cm-settings-root"
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 16,
        display: "grid",
        gap: 16,
      }}
    >
      <SectionTitle
        title="アカウント設定"
        helpLabel="アカウント設定について"
        helpContent="ログイン状態の確認、ログアウト、課金管理への導線です。"
      />

      <section
        className="cm-paper-card cm-settings-section"
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <div className="cm-section-title" style={{ fontWeight: 900, fontSize: 16 }}>
            アカウント
          </div>
          {showDeniedGate && !loading ? (
            <HelpTip label="ログイン状態について" content="現在: 未ログイン" />
          ) : null}
        </div>

        {loading ? (
          <p className="cm-home-loading-line" style={{ margin: 0 }}>
            読み込み中…
          </p>
        ) : linked ? (
          <>
            <p
              className="cm-settings-account-email"
              style={{ margin: 0, fontSize: 14, color: "#111827", fontWeight: 800 }}
            >
              demo@example.com
            </p>
            <button
              type="button"
              className="cm-cta-secondary cm-settings-logout"
              style={{
                width: "fit-content",
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 800,
              }}
            >
              ログアウト
            </button>
          </>
        ) : (
          <Link
            className="cm-cta-primary cm-settings-login"
            href="#"
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
            Google でログイン
          </Link>
        )}
      </section>

      <section
        className="cm-paper-card cm-settings-section cm-settings-section--notify"
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 10,
        }}
      >
        <div
          className="cm-settings-notify"
          data-cm-notify={notifyState}
          style={{ display: "grid", gap: 12 }}
        >
          <div>
            <div className="cm-section-title" style={{ fontWeight: 900, fontSize: 16 }}>
              メール通知
            </div>
            <p
              className="cm-settings-note"
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                color: "#6b7280",
                lineHeight: 1.6,
              }}
            >
              ブラウザを閉じていても、「今ひま？」呼び出しと集合プランをお知らせします。
              初期状態はオフです。クラスメッセージには送りません。
            </p>
          </div>

          {!canConfigure || showDeniedGate ? (
            <p
              className="cm-call-banner cm-call-banner--warn cm-settings-notify-gate"
              style={{ margin: 0, fontSize: 13, color: "#92400e", fontWeight: 700 }}
            >
              Google ログイン後に設定できます。
            </p>
          ) : (
            <>
              <p
                className="cm-settings-notify-email"
                style={{ margin: 0, fontSize: 12, color: "#6b7280" }}
              >
                送信先: demo@example.com
              </p>
              <label
                className="cm-settings-toggle"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                <input type="checkbox" checked={emailEnabled} readOnly />
                メール通知をオンにする
              </label>
              {emailEnabled ? (
                <div
                  className="cm-settings-toggle-group"
                  style={{ display: "grid", gap: 8, paddingLeft: 4 }}
                >
                  <label
                    className="cm-settings-toggle"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#374151",
                    }}
                  >
                    <input type="checkbox" checked readOnly />
                    「今ひま？」呼び出し
                  </label>
                  <label
                    className="cm-settings-toggle"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#374151",
                    }}
                  >
                    <input type="checkbox" checked readOnly />
                    集合プランの作成・更新
                  </label>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section
        className="cm-paper-card cm-settings-section"
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <div className="cm-section-title" style={{ fontWeight: 900, fontSize: 16 }}>
            課金
          </div>
          <HelpTip
            label="課金について"
            content="プランの確認・変更、支払い管理はこちらから行えます。"
          />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span
            className="cm-cta-secondary cm-settings-link"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              fontWeight: 800,
            }}
          >
            プラン
          </span>
          <span
            className="cm-cta-secondary cm-settings-link"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              fontWeight: 800,
            }}
          >
            お支払い管理
          </span>
        </div>
      </section>

      {scene === "error" ? (
        <p
          className="cm-home-error cm-settings-error"
          style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}
        >
          ログアウトに失敗しました。
        </p>
      ) : null}

      <p className="cm-settings-footer" style={{ margin: 0, fontSize: 13 }}>
        <span>プロフィール編集</span>
        {" · "}
        <span>ホーム</span>
      </p>
    </main>
  );
}
