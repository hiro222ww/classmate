"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import HomeMenuSheet from "@/components/HomeMenuSheet";
import MobileBottomNav, {
  shouldHideMobileBottomNav,
} from "@/components/nav/MobileBottomNav";
import { useAuth } from "@/components/AuthProvider";
import { IosWebPushInstallGuide } from "@/components/IosWebPushInstallGuide";
import { getDeviceId } from "@/lib/device";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import {
  buildShellAwareLoginUrl,
  buildShellAwareSettingsUrl,
} from "@/lib/appShellNavigation";
import { isAppShellContext } from "@/lib/appShellContext";
import { withDev } from "@/lib/withDev";

/**
 * Fixed web mobile bottom nav + shared menu sheet.
 * Hidden on immersive routes (/call, /room) and inside the native app shell.
 */
export default function WebMobileNavHost() {
  const pathname = usePathname() ?? "";
  const { loggedIn, accountLabel } = useAuth();
  /** Menu stays open only while pathname matches the path when it was opened. */
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [deviceId] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return getDeviceId();
    } catch {
      return "";
    }
  });
  const {
    enabled: notificationsEnabled,
    busy: notificationsBusy,
    toggle: toggleNotifications,
    iosInstallGuideOpen,
    dismissIosInstallGuide,
  } = useWebPushNotifications(deviceId, "web-bottom-nav");

  if (isAppShellContext()) return null;
  if (shouldHideMobileBottomNav(pathname)) return null;

  const menuOpen = menuPath === pathname;
  const returnPath = pathname || "/";

  return (
    <>
      {/* Scroll clearance so footer/content are not covered by the fixed nav */}
      <div
        className="cm-mobile-bottom-nav-spacer"
        aria-hidden
        style={{
          height: "max(72px, calc(56px + env(safe-area-inset-bottom, 0px)))",
        }}
      />
      <MobileBottomNav
        menuOpen={menuOpen}
        onMenuClick={() => setMenuPath(pathname)}
      />
      <HomeMenuSheet
        open={menuOpen}
        onClose={() => setMenuPath(null)}
        notificationsEnabled={notificationsEnabled}
        notificationsBusy={notificationsBusy}
        onToggleNotifications={toggleNotifications}
        hideWebPush={false}
        profileHref={withDev(buildProfileEditPath(returnPath))}
        myClassesHref={withDev("/class/mine")}
        planHref={withDev("/premium")}
        billingHref={withDev("/billing")}
        accountHref={
          loggedIn
            ? withDev(buildShellAwareSettingsUrl())
            : withDev(buildShellAwareLoginUrl(returnPath))
        }
        accountLabel={accountLabel}
        loggedIn={loggedIn}
        aboutHref={withDev("/about")}
        legalHref={withDev("/terms")}
        discoverHref={withDev("/class/select")}
        displayName={loggedIn ? accountLabel : "ゲスト"}
      />
      {iosInstallGuideOpen && dismissIosInstallGuide ? (
        <IosWebPushInstallGuide
          open={iosInstallGuideOpen}
          onClose={dismissIosInstallGuide}
        />
      ) : null}
    </>
  );
}
