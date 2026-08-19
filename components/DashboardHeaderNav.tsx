"use client";

import Link from "next/link";
import { buildShellAwareLoginUrl, buildShellAwareSettingsUrl } from "@/lib/appShellNavigation";
import { isAppShellContext } from "@/lib/appShellContext";
import { isDevFeatureEnabled } from "@/lib/devMode";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import { useDashboardAccountStatus } from "@/hooks/useDashboardAccountStatus";
import { useAuth } from "@/components/AuthProvider";
import { AuthLoadingBanner } from "@/components/AuthLoadingUI";
import { PushNotificationBell } from "@/components/PushNotificationBell";
import { IosWebPushInstallGuide } from "@/components/IosWebPushInstallGuide";
import { ClassmateEmblem } from "@/components/brand/ClassmateEmblem";

type Props = {
  returnPath: string;
  deviceId: string;
  hasProfile: boolean;
  withDev: (path: string) => string;
  notificationsEnabled?: boolean;
  notificationsBusy?: boolean;
  notificationsFeedback?: string | null;
  onToggleNotifications?: () => void | Promise<void>;
  iosInstallGuideOpen?: boolean;
  onDismissIosInstallGuide?: () => void;
  /**
   * UI variants are visual-only. Navigation destinations and side effects stay the same.
   */
  variant?: "default" | "homeIconMenu";
};

export function DashboardHeaderNav({
  returnPath,
  deviceId,
  hasProfile,
  withDev,
  notificationsEnabled = false,
  notificationsBusy = false,
  notificationsFeedback = null,
  onToggleNotifications,
  iosInstallGuideOpen = false,
  onDismissIosInstallGuide,
  variant = "default",
}: Props) {
  const { ready, loggedIn, accountLabel, adminAuthenticated, opsTestFlags } =
    useDashboardAccountStatus(deviceId);
  const opsTestActive =
    opsTestFlags.ignoreAdmission ||
    opsTestFlags.ignoreAge ||
    opsTestFlags.allowMinorProfile ||
    opsTestFlags.ignoreRecruitment;
  const { status, slow, error } = useAuth();
  const hideWebPush = isAppShellContext();

  const accountHref = loggedIn
    ? withDev(buildShellAwareSettingsUrl())
    : withDev(buildShellAwareLoginUrl(returnPath));

  if (variant === "homeIconMenu") {
    const settingUp =
      notificationsBusy &&
      !notificationsEnabled &&
      notificationsFeedback === "通知を設定しています…";
    const notificationSecondLine = settingUp
      ? "設定中…"
      : notificationsEnabled
        ? "ON"
        : "OFF";

    function GlyphBell({ enabled }: { enabled: boolean }) {
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          {!enabled ? (
            <path d="M2 2l20 20" strokeOpacity="0.25" strokeWidth="1.6" />
          ) : null}
        </svg>
      );
    }

    function GlyphUser() {
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    }

    function GlyphCrown() {
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 7l4 4 5-8 5 8 4-4v14H3V7z" />
        </svg>
      );
    }

    function GlyphCard() {
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      );
    }

    function GlyphGoogle() {
      return (
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            background:
              "conic-gradient(from 45deg, #ea4335, #fbbc05, #34a853, #4285f4, #ea4335)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>G</span>
        </span>
      );
    }

    const profileHref = withDev(buildProfileEditPath(returnPath));
    const planHref = withDev("/premium");
    const billingHref = withDev("/billing");
    const googleLabel = loggedIn ? accountLabel : "ログイン";

    return (
      <div style={{ display: "grid", gap: 10, width: "100%" }}>
        {onDismissIosInstallGuide ? (
          <IosWebPushInstallGuide
            open={iosInstallGuideOpen}
            onClose={onDismissIosInstallGuide}
          />
        ) : null}

        {status === "loading" ? (
          <div style={{ minWidth: 200, maxWidth: 280 }}>
            <AuthLoadingBanner
              compact
              slow={slow}
              error={error}
              onReload={() => {
                window.location.reload();
              }}
            />
          </div>
        ) : (
          <nav
            aria-label="アカウント操作"
            style={{
              width: "100%",
              display: "flex",
              gap: 6,
              padding: "10px 10px",
              borderRadius: 16,
              background: "rgba(255, 255, 255, 0.68)",
              border: "1px solid rgba(17, 24, 39, 0.06)",
              boxShadow: "0 10px 22px rgba(15, 23, 42, 0.04)",
              backdropFilter: "blur(6px)",
              alignItems: "stretch",
            }}
          >
            {onToggleNotifications && !hideWebPush ? (
              <button
                type="button"
                onClick={() => void onToggleNotifications()}
                disabled={notificationsBusy}
                aria-pressed={notificationsEnabled}
                aria-label={
                  notificationsEnabled
                    ? "通知をオフにする"
                    : "通知をオンにする"
                }
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "grid",
                  justifyItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  padding: 6,
                  cursor: notificationsBusy ? "not-allowed" : "pointer",
                  color: "var(--cm-text, #111827)",
                }}
              >
                <span style={{ display: "inline-flex", color: "#0f172a" }}>
                  <GlyphBell enabled={notificationsEnabled} />
                </span>
                <span style={{ fontSize: 11, fontWeight: 900, lineHeight: 1.05 }}>
                  <span style={{ display: "block" }}>通知</span>
                  <span
                    style={{
                      display: "block",
                      color: "var(--cm-muted, #4b5563)",
                    }}
                  >
                    {notificationSecondLine}
                  </span>
                </span>
              </button>
            ) : (
              <span style={{ flex: 1, minWidth: 0 }} />
            )}

            <Link
              href={profileHref}
              style={{
                flex: 1,
                minWidth: 0,
                textDecoration: "none",
                color: "var(--cm-text, #111827)",
                display: "grid",
                justifyItems: "center",
                gap: 4,
                padding: 6,
              }}
            >
              <GlyphUser />
              <span style={{ fontSize: 11, fontWeight: 900, color: "#0f172a" }}>
                <span style={{ display: "block" }}>プロフィール</span>
              </span>
            </Link>

            <Link
              href={planHref}
              style={{
                flex: 1,
                minWidth: 0,
                textDecoration: "none",
                color: "var(--cm-text, #111827)",
                display: "grid",
                justifyItems: "center",
                gap: 4,
                padding: 6,
              }}
            >
              <GlyphCrown />
              <span style={{ fontSize: 11, fontWeight: 900, color: "#0f172a" }}>
                <span style={{ display: "block" }}>プラン</span>
              </span>
            </Link>

            <Link
              href={billingHref}
              style={{
                flex: 1,
                minWidth: 0,
                textDecoration: "none",
                color: "var(--cm-text, #111827)",
                display: "grid",
                justifyItems: "center",
                gap: 4,
                padding: 6,
              }}
            >
              <GlyphCard />
              <span style={{ fontSize: 11, fontWeight: 900, color: "#0f172a" }}>
                <span style={{ display: "block" }}>お支払い</span>
              </span>
            </Link>

            <Link
              href={accountHref}
              style={{
                flex: 1,
                minWidth: 0,
                textDecoration: "none",
                color: "var(--cm-text, #111827)",
                display: "grid",
                justifyItems: "center",
                gap: 4,
                padding: 6,
                overflow: "hidden",
              }}
            >
              <GlyphGoogle />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: "#0f172a",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  width: "100%",
                  textAlign: "center",
                }}
              >
                {googleLabel}
              </span>
            </Link>
          </nav>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        justifyContent: "flex-end",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      {onToggleNotifications && !hideWebPush ? (
        <PushNotificationBell
          enabled={notificationsEnabled}
          busy={notificationsBusy}
          feedback={notificationsFeedback}
          onToggle={onToggleNotifications}
        />
      ) : null}
      {onDismissIosInstallGuide ? (
        <IosWebPushInstallGuide
          open={iosInstallGuideOpen}
          onClose={onDismissIosInstallGuide}
        />
      ) : null}

      {status === "loading" ? (
        <div style={{ minWidth: 200, maxWidth: 280 }}>
          <AuthLoadingBanner
            compact
            slow={slow}
            error={error}
            onReload={() => {
              window.location.reload();
            }}
          />
        </div>
      ) : (
        <>
          <Link
            href={withDev(buildProfileEditPath(returnPath))}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--cm-radius-sm, 12px)",
              border: hasProfile
                ? "1px solid var(--dash-secondary-border, #e5e7eb)"
                : "1px solid var(--dash-primary-bg, #111827)",
              background: hasProfile
                ? "var(--dash-secondary-bg, #fff)"
                : "var(--dash-primary-bg, #111827)",
              fontWeight: 800,
              fontSize: 13,
              color: hasProfile
                ? "var(--dash-secondary-text, #374151)"
                : "#fff",
              textDecoration: "none",
            }}
          >
            {hasProfile ? "プロフィール編集" : "プロフィール登録"}
          </Link>

          <Link
            href={withDev("/premium")}
            style={{
              padding: "8px 10px",
              borderRadius: "var(--cm-radius-sm, 12px)",
              border: "1px solid var(--dash-secondary-border, #ccc)",
              background: "var(--dash-secondary-bg, #fff)",
              fontWeight: 900,
              fontSize: 13,
              color: "var(--cm-text, #111)",
              textDecoration: "none",
            }}
          >
            プランを見る
          </Link>

          <Link
            href={withDev("/billing")}
            style={{
              padding: "8px 10px",
              borderRadius: "var(--cm-radius-sm, 12px)",
              border: "1px solid var(--dash-secondary-border, #ccc)",
              background: "var(--dash-secondary-bg, #fff)",
              fontWeight: 900,
              fontSize: 13,
              color: "var(--cm-text, #111)",
              textDecoration: "none",
            }}
          >
            お支払い・解約
          </Link>

          <Link
            href={accountHref}
            style={{
              padding: "8px 10px",
              borderRadius: "var(--cm-radius-sm, 12px)",
              border: loggedIn
                ? "1px solid rgba(47, 109, 181, 0.35)"
                : "1px solid var(--dash-secondary-border, #e5e7eb)",
              background: loggedIn
                ? "rgba(47, 109, 181, 0.1)"
                : "var(--dash-secondary-bg, #fff)",
              fontWeight: 800,
              fontSize: 12,
              color: "var(--cm-text, #111827)",
              textDecoration: "none",
              opacity: ready ? 1 : 0.65,
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {accountLabel}
          </Link>

          {adminAuthenticated ? (
            <>
              {opsTestActive ? (
                <span
                  title="運営テストモードが有効です（管理者本人のみ）"
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid #f59e0b",
                    background: "#fffbeb",
                    fontWeight: 800,
                    fontSize: 11,
                    color: "#92400e",
                    letterSpacing: "0.02em",
                  }}
                >
                  運営テスト中
                </span>
              ) : (
                <span
                  title="管理者としてログイン中です"
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid #d6d3d1",
                    background: "rgba(255,253,250,0.9)",
                    fontWeight: 700,
                    fontSize: 11,
                    color: "#78716c",
                    letterSpacing: "0.02em",
                  }}
                >
                  管理者
                </span>
              )}
              <Link
                href={withDev("/admin")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #c4b5fd",
                  background: "#f5f3ff",
                  fontWeight: 900,
                  fontSize: 13,
                  color: "#5b21b6",
                  textDecoration: "none",
                }}
              >
                管理
              </Link>
            </>
          ) : null}

          {isDevFeatureEnabled() ? (
            <Link
              href={withDev("/dev/console")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #f59e0b",
                background: "#fffbeb",
                fontWeight: 900,
                fontSize: 13,
                color: "#92400e",
                textDecoration: "none",
              }}
            >
              🧪 開発コンソール
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}

export function DashboardPageHeader({
  children,
  showBrand = true,
}: {
  children: React.ReactNode;
  showBrand?: boolean;
}) {
  return (
    <header
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {showBrand ? (
        <div className="cm-emblem-heading" style={{ minWidth: 0, maxWidth: "100%" }}>
          <ClassmateEmblem size="sm" decorative />
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 900,
              color: "#111",
              letterSpacing: 0.5,
            }}
          >
            classmate
          </h1>
        </div>
      ) : null}
      {children}
    </header>
  );
}
