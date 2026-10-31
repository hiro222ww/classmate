"use client";

import Link from "next/link";
import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { resolveShellDashboardPath } from "@/lib/appShellContext";
import { withDev } from "@/lib/withDev";
import { CmAvatar } from "@/components/ui/CmAvatar";
import { PushNotificationBell } from "@/components/PushNotificationBell";

const subscribe = () => () => {};
const homeHref = () => withDev(resolveShellDashboardPath());
const serverHomeHref = () => "/";
const BRAND_MARK_SRC = "/brand/classmate-mark.png";

function keepCurrentHome(event: MouseEvent<HTMLAnchorElement>) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (event.currentTarget.href === window.location.href) event.preventDefault();
}

export type CmAppHeaderProps = {
  /** Short brand line under the wordmark. Keep ≤ ~28 chars on mobile. */
  tagline?: string | null;
  displayName?: string;
  photoPath?: string | null;
  avatarUrl?: string | null;
  profileHref?: string;
  notificationsEnabled?: boolean;
  notificationsBusy?: boolean;
  onToggleNotifications?: () => void | Promise<void>;
  hideWebPush?: boolean;
  /** Optional right-side control (e.g. app-shell only). */
  trailing?: ReactNode;
  className?: string;
};

/**
 * Shared compact app header for web surfaces (home / mine / select / auth).
 * Avoids the legacy `.cm-classroom-scope header` chalkboard nameplate styles
 * by using a div with role="banner" and the `.cm-app-header` class.
 */
export function CmAppHeader({
  tagline = null,
  displayName = "ゲスト",
  photoPath = null,
  avatarUrl = null,
  profileHref,
  notificationsEnabled = false,
  notificationsBusy = false,
  onToggleNotifications,
  hideWebPush = true,
  trailing,
  className,
}: CmAppHeaderProps) {
  const href = useSyncExternalStore(subscribe, homeHref, serverHomeHref);
  const showActions =
    Boolean(trailing) ||
    Boolean(profileHref) ||
    (!hideWebPush && Boolean(onToggleNotifications));

  return (
    <div
      role="banner"
      className={["cm-app-header", className].filter(Boolean).join(" ")}
    >
      <div className="cm-app-header-row">
        <Link
          href={href}
          onClick={keepCurrentHome}
          aria-label="Classmate — ホームへ戻る"
          className="cm-brand-home-link cm-app-header-brand"
        >
          <img
            src={BRAND_MARK_SRC}
            alt=""
            width={32}
            height={32}
            decoding="async"
            fetchPriority="high"
            aria-hidden
            className="cm-app-header-mark"
          />
          <div className="cm-app-header-titles">
            <span className="cm-app-header-wordmark">Classmate</span>
            {tagline ? (
              <span className="cm-app-header-tagline">{tagline}</span>
            ) : (
              <span className="cm-app-header-kana">クラスメイト</span>
            )}
          </div>
        </Link>

        {showActions ? (
          <div className="cm-app-header-actions">
            {!hideWebPush && onToggleNotifications ? (
              <PushNotificationBell
                enabled={notificationsEnabled}
                busy={notificationsBusy}
                onToggle={onToggleNotifications}
                compact
              />
            ) : null}
            {profileHref ? (
              <Link
                href={profileHref}
                aria-label="プロフィール編集"
                className="cm-app-header-avatar-link"
              >
                <CmAvatar
                  label={displayName}
                  sizePx={32}
                  photoPath={photoPath}
                  avatarUrl={avatarUrl}
                />
              </Link>
            ) : null}
            {trailing}
          </div>
        ) : null}
      </div>
    </div>
  );
}
