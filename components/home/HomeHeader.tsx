"use client";

import Link from "next/link";
import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { HOME_INTRO } from "@/lib/seo";
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

type HomeHeaderProps = {
  intro?: string;
  displayName?: string;
  photoPath?: string | null;
  avatarUrl?: string | null;
  profileHref?: string;
  notificationsEnabled?: boolean;
  notificationsBusy?: boolean;
  onToggleNotifications?: () => void | Promise<void>;
  hideWebPush?: boolean;
  trailing?: ReactNode;
};

/**
 * Redesigned home header: brand + short intro + push bell + profile avatar.
 */
export function HomeHeader({
  intro = HOME_INTRO,
  displayName = "ゲスト",
  photoPath = null,
  avatarUrl = null,
  profileHref,
  notificationsEnabled = false,
  notificationsBusy = false,
  onToggleNotifications,
  hideWebPush = false,
  trailing,
}: HomeHeaderProps) {
  const href = useSyncExternalStore(subscribe, homeHref, serverHomeHref);
  const shortIntro =
    intro.length > 42 ? `${intro.slice(0, 40).trimEnd()}…` : intro;

  return (
    <header className="cm-home-header cm-stagger-1">
      <div className="cm-home-header-top">
        <Link
          href={href}
          onClick={keepCurrentHome}
          aria-label="Classmate — ホームへ戻る"
          className="cm-brand-home-link cm-home-header-brand"
        >
          <img
            src={BRAND_MARK_SRC}
            alt=""
            width={48}
            height={48}
            decoding="async"
            fetchPriority="high"
            aria-hidden
            className="cm-home-header-mark"
          />
          <div style={{ minWidth: 0 }}>
            <span className="cm-home-header-wordmark">Classmate</span>
            <span className="cm-home-header-kana">クラスメイト</span>
          </div>
        </Link>

        <div className="cm-home-header-actions">
          {!hideWebPush && onToggleNotifications ? (
            <PushNotificationBell
              enabled={notificationsEnabled}
              busy={notificationsBusy}
              onToggle={onToggleNotifications}
            />
          ) : null}
          {profileHref ? (
            <Link
              href={profileHref}
              aria-label="プロフィール編集"
              className="cm-home-header-avatar-link"
            >
              <CmAvatar
                label={displayName}
                sizePx={40}
                photoPath={photoPath}
                avatarUrl={avatarUrl}
              />
            </Link>
          ) : (
            <CmAvatar
              label={displayName}
              sizePx={40}
              photoPath={photoPath}
              avatarUrl={avatarUrl}
            />
          )}
          {trailing}
        </div>
      </div>
      <p className="cm-home-header-intro cm-stagger-2">{shortIntro}</p>
    </header>
  );
}
