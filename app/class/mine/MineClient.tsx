"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { HomeBrandVisual } from "@/components/brand/HomeBrandVisual";
import HomeMenuSheet from "@/components/HomeMenuSheet";
import { useAuth } from "@/components/AuthProvider";
import { IosWebPushInstallGuide } from "@/components/IosWebPushInstallGuide";
import { DASH_CARD, HOME_DASHBOARD_LAYOUT_CSS } from "@/components/dashboard/dashboardStyles";
import { getDeviceId } from "@/lib/device";
import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";
import { openJoinedClassFromSnapshot } from "@/lib/openJoinedClassClient";
import type { CurrentClassSnapshot } from "@/lib/currentClassTypes";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import {
  buildShellAwareLoginUrl,
  buildShellAwareSettingsUrl,
} from "@/lib/appShellNavigation";
import { isAppShellContext } from "@/lib/appShellContext";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import { withDev } from "@/lib/withDev";

type MineClassRow = {
  classId: string;
  name: string;
  topicKey: string | null;
  worldKey: string | null;
  topicTitle: string | null;
  statusLabel: string;
  sessionId: string | null;
};

function toSnapshot(row: MineClassRow): CurrentClassSnapshot {
  return {
    classId: row.classId,
    name: row.name,
    topicKey: row.topicKey,
    worldKey: row.worldKey,
    topicTitle: row.topicTitle,
    statusLabel: row.statusLabel,
    sessionId: row.sessionId,
    joinedAt: null,
  };
}

export default function MineClient() {
  const router = useRouter();
  const { loggedIn, accountLabel } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<MineClassRow[]>([]);
  const [error, setError] = useState("");
  const [openingClassId, setOpeningClassId] = useState("");
  const {
    enabled: notificationsEnabled,
    busy: notificationsBusy,
    toggle: toggleNotifications,
    iosInstallGuideOpen,
    dismissIosInstallGuide,
  } = useWebPushNotifications(deviceId, "class-mine");

  const loadClasses = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ deviceId: id, lite: "1" });
      const res = await fetch(`/api/class/mine?${qs.toString()}`, {
        cache: "no-store",
        headers: await buildDeviceAuthHeaders(id),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !Array.isArray(json.classes)) {
        setClasses([]);
        setError("所属クラスを読み込めませんでした。");
        return;
      }

      const next: MineClassRow[] = json.classes
        .map((row: Record<string, unknown>) => {
          const classId = String(row.class_id ?? row.id ?? "").trim();
          if (!classId) return null;
          return {
            classId,
            name: String(row.name ?? "").trim() || "所属クラス",
            topicKey: String(row.topic_key ?? "").trim() || null,
            worldKey: String(row.world_key ?? "").trim() || null,
            topicTitle: String(row.topic_title ?? "").trim() || null,
            statusLabel: String(row.status_label ?? "").trim() || "所属中",
            sessionId: String(row.session_id ?? "").trim() || null,
          } satisfies MineClassRow;
        })
        .filter(Boolean) as MineClassRow[];

      setClasses(next);
    } catch {
      setClasses([]);
      setError("所属クラスを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    if (!id) {
      setLoading(false);
      setError("端末情報を取得できませんでした。");
      return;
    }
    void loadClasses(id);
  }, [loadClasses]);

  async function onOpenClass(row: MineClassRow) {
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
      current: toSnapshot(row),
      withDev,
    });

    if (result.ok) {
      router.push(result.roomPath);
      return;
    }

    setError(result.message);
    void loadClasses(id);
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
            ? { color: "#111" }
            : { padding: "16px 16px 28px", maxWidth: 720, margin: "0 auto", color: "#111" }),
          ["--dash-primary-bg-full" as string]:
            "linear-gradient(180deg, #059669 0%, #10b981 42%, #34d399 100%)",
          ["--dash-primary-shadow" as string]:
            "0 1px 0 rgba(255, 255, 255, 0.22) inset, 0 8px 20px rgba(5, 150, 105, 0.3)",
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
        termsHref={withDev("/terms")}
        privacyHref={withDev("/privacy")}
        guidelinesHref={withDev("/guidelines")}
        commercialHref={withDev("/legal/commercial-disclosure")}
      />

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
              color: "#0f172a",
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
              color: "#64748b",
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
              if (id) void loadClasses(id);
            }}
            disabled={loading}
            style={{
              marginLeft: "auto",
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #e2e8f0",
              background: "#fff",
              fontSize: 12,
              fontWeight: 800,
              color: "#64748b",
              cursor: loading ? "default" : "pointer",
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
          <section className="cm-paper-card" style={DASH_CARD} aria-busy="true">
            <div
              style={{
                height: 18,
                width: "42%",
                borderRadius: 8,
                background: "#f3f4f6",
              }}
            />
            <div
              style={{
                marginTop: 12,
                height: 48,
                borderRadius: 12,
                background: "#f9fafb",
              }}
            />
          </section>
        ) : error ? null : classes.length === 0 ? (
          <section className="cm-paper-card" style={{ ...DASH_CARD, padding: 20 }}>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 800,
                color: "#475569",
                textAlign: "center",
                lineHeight: 1.55,
              }}
            >
              所属しているクラスはありません
            </p>
          </section>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {classes.map((row) => {
              const opening = openingClassId === row.classId;
              return (
                <button
                  key={row.classId}
                  type="button"
                  className="cm-paper-card cm-mine-class-row"
                  disabled={Boolean(openingClassId)}
                  onClick={() => void onOpenClass(row)}
                  style={{
                    ...DASH_CARD,
                    textAlign: "left",
                    cursor: openingClassId ? "default" : "pointer",
                    opacity: openingClassId && !opening ? 0.65 : 1,
                    display: "grid",
                    gap: 6,
                    padding: "16px 16px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 17,
                      fontWeight: 900,
                      color: "#0f172a",
                      lineHeight: 1.3,
                    }}
                  >
                    {row.name}
                  </span>
                  {row.topicTitle ? (
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#64748b",
                      }}
                    >
                      {row.topicTitle}
                    </span>
                  ) : null}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#059669",
                    }}
                  >
                    {opening ? "入室中…" : row.statusLabel || "開く"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
