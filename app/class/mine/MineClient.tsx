"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HomeBrandVisual } from "@/components/brand/HomeBrandVisual";
import HomeMenuSheet from "@/components/HomeMenuSheet";
import { MyClassCard } from "@/components/home/MyClassCard";
import { MyClassEmpty } from "@/components/home/MyClassEmpty";
import { useAuth } from "@/components/AuthProvider";
import { IosWebPushInstallGuide } from "@/components/IosWebPushInstallGuide";
import { HOME_DASHBOARD_LAYOUT_CSS } from "@/components/dashboard/dashboardStyles";
import { getDeviceId } from "@/lib/device";
import { openJoinedClassFromSnapshot } from "@/lib/openJoinedClassClient";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import {
  buildShellAwareLoginUrl,
  buildShellAwareSettingsUrl,
} from "@/lib/appShellNavigation";
import { isAppShellContext } from "@/lib/appShellContext";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import {
  joinedClassToSnapshot,
  useJoinedClasses,
  type JoinedClassRow,
} from "@/hooks/useJoinedClasses";
import { withDev } from "@/lib/withDev";

export default function MineClient() {
  const router = useRouter();
  const { loggedIn, accountLabel } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openingClassId, setOpeningClassId] = useState("");
  const {
    deviceId,
    loading,
    classes,
    error,
    reload,
    setError,
  } = useJoinedClasses();
  const {
    enabled: notificationsEnabled,
    busy: notificationsBusy,
    toggle: toggleNotifications,
    iosInstallGuideOpen,
    dismissIosInstallGuide,
  } = useWebPushNotifications(deviceId, "class-mine");

  async function onOpenClass(row: JoinedClassRow) {
    if (openingClassId) return;
    setOpeningClassId(row.classId);
    setError("");

    const id = String(deviceId || getDeviceId()).trim();
    if (!id) {
      setError("端末情報を取得できませんでした。");
      setOpeningClassId("");
      return;
    }

    const result = await openJoinedClassFromSnapshot({
      deviceId: id,
      current: joinedClassToSnapshot(row),
      withDev,
    });

    if (result.ok) {
      router.push(result.roomPath);
      return;
    }

    setError(result.message);
    void reload(id);
    setOpeningClassId("");
  }

  const isApp = isAppShellContext();
  const scopeClass = [
    "cm-classroom-scope",
    "cm-select-scope",
    "cm-mine-scope",
    isApp ? "app-immersive-inner" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const menuButton = (
    <button
      type="button"
      className="cm-hamburger-btn"
      aria-label="メニューを開く"
      onClick={() => setMenuOpen(true)}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="#374151"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <line x1="3" y1="5" x2="17" y2="5" />
        <line x1="3" y1="10" x2="17" y2="10" />
        <line x1="3" y1="15" x2="17" y2="15" />
      </svg>
      {!notificationsEnabled && !isApp ? <span className="cm-hamburger-dot" /> : null}
    </button>
  );

  return (
    <main
      className={scopeClass}
      style={
        {
          ...(isApp
            ? { color: "var(--cm-text)" }
            : {
                padding: "16px 16px 28px",
                maxWidth: 720,
                margin: "0 auto",
                color: "var(--cm-text)",
              }),
        } as CSSProperties
      }
    >
      <style>{HOME_DASHBOARD_LAYOUT_CSS}</style>

      <HomeBrandVisual menuButton={menuButton} />

      <HomeMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        notificationsEnabled={notificationsEnabled}
        notificationsBusy={notificationsBusy}
        onToggleNotifications={toggleNotifications}
        hideWebPush={isApp}
        profileHref={withDev(buildProfileEditPath("/class/mine"))}
        myClassesHref={withDev("/class/mine")}
        planHref={withDev("/premium")}
        billingHref={withDev("/billing")}
        accountHref={
          loggedIn
            ? withDev(buildShellAwareSettingsUrl())
            : withDev(buildShellAwareLoginUrl("/class/mine"))
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

      <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
        <header className="cm-page-heading">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <h1>マイクラス</h1>
            <button
              type="button"
              className="cm-text-btn"
              onClick={() => {
                const id = String(deviceId || getDeviceId()).trim();
                if (id) void reload(id);
              }}
              disabled={loading}
            >
              更新
            </button>
          </div>
        </header>

        {error ? (
          <div className="cm-empty-state" role="alert">
            <p className="cm-empty-state-title">読み込めませんでした</p>
            <div className="cm-empty-state-actions">
              <button
                type="button"
                className="cm-text-btn"
                onClick={() => {
                  const id = String(deviceId || getDeviceId()).trim();
                  if (id) void reload(id);
                }}
              >
                再試行
              </button>
              <Link href={withDev("/class/select")} className="cm-home-discover-link">
                探す
              </Link>
            </div>
          </div>
        ) : null}

        {loading ? (
          <section
            className="cm-paper-card"
            aria-busy="true"
            style={{
              padding: 16,
              borderRadius: 18,
              border: "1px solid var(--cm-border)",
              background: "var(--cm-card-bg)",
            }}
          >
            <div
              style={{
                height: 16,
                width: "40%",
                borderRadius: 8,
                background: "var(--cm-card-bg-soft)",
              }}
            />
            <div
              style={{
                marginTop: 12,
                height: 64,
                borderRadius: 12,
                background: "var(--cm-card-bg-soft)",
              }}
            />
          </section>
        ) : error ? null : classes.length === 0 ? (
          <MyClassEmpty />
        ) : (
          <div className="cm-my-class-list">
            {classes.map((row) => (
              <MyClassCard
                key={row.classId}
                row={row}
                opening={openingClassId === row.classId}
                disabled={Boolean(openingClassId)}
                onOpen={(target) => void onOpenClass(target)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
