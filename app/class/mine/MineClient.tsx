"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { HomeBrandVisual } from "@/components/brand/HomeBrandVisual";
import HomeMenuSheet from "@/components/HomeMenuSheet";
import { MyClassCard } from "@/components/home/MyClassCard";
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

      <HomeBrandVisual menuButton={isApp ? menuButton : undefined} showIntro={false} />

      {isApp ? (
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
        />
      ) : null}

      {iosInstallGuideOpen && dismissIosInstallGuide ? (
        <IosWebPushInstallGuide
          open={iosInstallGuideOpen}
          onClose={dismissIosInstallGuide}
        />
      ) : null}

      <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 900,
              color: "var(--cm-text)",
              letterSpacing: 0.01,
              lineHeight: 1.25,
            }}
          >
            マイクラス
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--cm-muted)",
            }}
          >
            所属しているクラスを選べます
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={() => {
              const id = String(deviceId || getDeviceId()).trim();
              if (id) void reload(id);
            }}
            disabled={loading}
            style={{
              marginLeft: "auto",
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid var(--cm-border)",
              background: "#fff",
              fontSize: 12,
              fontWeight: 800,
              color: "var(--cm-muted)",
              cursor: loading ? "default" : "pointer",
              minHeight: 44,
            }}
          >
            更新
          </button>
        </div>

        {error ? (
          <p
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 12,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <section
            className="cm-paper-card"
            aria-busy="true"
            style={{
              padding: 16,
              borderRadius: "var(--cm-radius)",
              border: "1px solid var(--cm-border)",
              background: "var(--cm-card-bg)",
            }}
          >
            <div
              style={{
                height: 18,
                width: "42%",
                borderRadius: 8,
                background: "var(--cm-card-bg-soft)",
              }}
            />
            <div
              style={{
                marginTop: 12,
                height: 72,
                borderRadius: 12,
                background: "var(--cm-card-bg-soft)",
              }}
            />
          </section>
        ) : error ? null : classes.length === 0 ? (
          <section
            className="cm-paper-card"
            style={{
              padding: 20,
              borderRadius: "var(--cm-radius)",
              border: "1px solid var(--cm-border)",
              background: "var(--cm-card-bg)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 800,
                color: "var(--cm-muted)",
                textAlign: "center",
                lineHeight: 1.55,
              }}
            >
              所属しているクラスはありません
            </p>
          </section>
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
