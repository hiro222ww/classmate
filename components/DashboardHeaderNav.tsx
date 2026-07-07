"use client";

import Link from "next/link";
import { buildShellAwareLoginUrl, buildShellAwareSettingsUrl } from "@/lib/appShellNavigation";
import { isDevFeatureEnabled } from "@/lib/devMode";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import { useDashboardAccountStatus } from "@/hooks/useDashboardAccountStatus";
import { PushNotificationBell } from "@/components/PushNotificationBell";

type Props = {
  returnPath: string;
  deviceId: string;
  hasProfile: boolean;
  withDev: (path: string) => string;
  notificationsEnabled?: boolean;
  notificationsBusy?: boolean;
  notificationsFeedback?: string | null;
  onToggleNotifications?: () => void | Promise<void>;
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
}: Props) {
  const { ready, loggedIn, accountLabel, adminAuthenticated } =
    useDashboardAccountStatus(deviceId);

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
      {onToggleNotifications ? (
        <PushNotificationBell
          enabled={notificationsEnabled}
          busy={notificationsBusy}
          feedback={notificationsFeedback}
          onToggle={onToggleNotifications}
        />
      ) : null}

      <Link
        href={withDev(buildProfileEditPath(returnPath))}
        style={{
          padding: "8px 12px",
          borderRadius: 12,
          border: hasProfile ? "1px solid #e5e7eb" : "1px solid #111827",
          background: hasProfile ? "#fff" : "#111827",
          fontWeight: 800,
          fontSize: 13,
          color: hasProfile ? "#374151" : "#fff",
          textDecoration: "none",
        }}
      >
        {hasProfile ? "プロフィール編集" : "プロフィール登録"}
      </Link>

      <Link
        href={withDev("/premium")}
        style={{
          padding: "8px 10px",
          borderRadius: 12,
          border: "1px solid #ccc",
          background: "#fff",
          fontWeight: 900,
          fontSize: 13,
          color: "#111",
          textDecoration: "none",
        }}
      >
        プランを見る
      </Link>

      <Link
        href={withDev("/billing")}
        style={{
          padding: "8px 10px",
          borderRadius: 12,
          border: "1px solid #ccc",
          background: "#fff",
          fontWeight: 900,
          fontSize: 13,
          color: "#111",
          textDecoration: "none",
        }}
      >
        お支払い・解約
      </Link>

      <Link
        href={accountHref}
        style={{
          padding: "8px 10px",
          borderRadius: 12,
          border: loggedIn ? "1px solid #dbeafe" : "1px solid #e5e7eb",
          background: loggedIn ? "#eff6ff" : "#fff",
          fontWeight: 800,
          fontSize: 12,
          color: "#111827",
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
      <div>
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
