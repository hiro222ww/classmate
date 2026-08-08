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
}: Props) {
  const { ready, loggedIn, accountLabel, adminAuthenticated } =
    useDashboardAccountStatus(deviceId);
  const { status, slow, error } = useAuth();
  const hideWebPush = isAppShellContext();

  const accountHref = loggedIn
    ? withDev(buildShellAwareSettingsUrl())
    : withDev(buildShellAwareLoginUrl(returnPath));

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        justifyContent: "flex-end",
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
}: {
  children: React.ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div className="cm-emblem-heading">
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
      {children}
    </header>
  );
}
