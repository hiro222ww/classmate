"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { useAuth } from "@/components/AuthProvider";
import {
  AuthCardSkeleton,
  AuthLoadingBanner,
  AuthTextSkeleton,
} from "@/components/AuthLoadingUI";
import { buildShellAwareLoginUrl } from "@/lib/appShellNavigation";
import { buildDeviceAuthHeaders, fetchSelfProfile } from "@/lib/fetchCurrentClass";
import { openJoinedClassFromSnapshot } from "@/lib/openJoinedClassClient";
import type { CurrentClassSnapshot } from "@/lib/currentClassTypes";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import { withDev } from "@/lib/withDev";
import AppShellPage from "@/components/app-shell/AppShellPage";
import AppShellSection from "@/components/app-shell/AppShellSection";

type JoinedClassRow = {
  classId: string;
  name: string;
  topicKey: string | null;
  worldKey: string | null;
  topicTitle: string | null;
  statusLabel: string;
  sessionId: string | null;
  joinedAt: string | null;
};

function toSnapshot(row: JoinedClassRow): CurrentClassSnapshot {
  return {
    classId: row.classId,
    name: row.name,
    topicKey: row.topicKey,
    worldKey: row.worldKey,
    topicTitle: row.topicTitle,
    statusLabel: row.statusLabel,
    sessionId: row.sessionId,
    joinedAt: row.joinedAt,
  };
}

export default function AppHomeClient() {
  const router = useRouter();
  const { status, loggedIn, accountLabel, slow, error: authError } = useAuth();
  const [deviceId, setDeviceId] = useState("");
  const [hasProfile, setHasProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [classesLoading, setClassesLoading] = useState(true);
  const [joinedClasses, setJoinedClasses] = useState<JoinedClassRow[]>([]);
  const [openingClassId, setOpeningClassId] = useState("");
  const [openError, setOpenError] = useState("");

  async function loadJoinedClasses(id: string) {
    setClassesLoading(true);
    setOpenError("");
    try {
      const qs = new URLSearchParams({ deviceId: id, lite: "1" });
      const res = await fetch(`/api/class/mine?${qs.toString()}`, {
        cache: "no-store",
        headers: await buildDeviceAuthHeaders(id),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok || !Array.isArray(json.classes)) {
        setJoinedClasses([]);
        return;
      }

      const next: JoinedClassRow[] = json.classes
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
            joinedAt: null,
          } satisfies JoinedClassRow;
        })
        .filter(Boolean) as JoinedClassRow[];

      setJoinedClasses(next);
    } catch {
      setJoinedClasses([]);
    } finally {
      setClassesLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const id = getDeviceId();
      setDeviceId(id);

      if (!id) {
        setProfileLoading(false);
        setClassesLoading(false);
        return;
      }

      setProfileLoading(true);
      const profile = await fetchSelfProfile(id);
      const name = String(profile.profile?.display_name ?? "").trim();
      setHasProfile(Boolean(name));
      setProfileLoading(false);
      await loadJoinedClasses(id);
    })();
  }, []);

  const returnPath = "/app/home";
  const hasMembership = joinedClasses.length > 0;
  const authLoading = status === "loading";
  const actionsLocked = authLoading;

  async function onEnterClass(row: JoinedClassRow) {
    if (openingClassId || actionsLocked) return;

    setOpeningClassId(row.classId);
    setOpenError("");

    const id = String(deviceId || getDeviceId()).trim();
    if (!id) {
      setOpenError("端末情報を取得できませんでした。");
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

    setOpenError(result.message);
    void loadJoinedClasses(id);
    setOpeningClassId("");
  }

  return (
    <AppShellPage>
      <header>
        <h1 className="app-shell-title">Classmate</h1>
        <p className="app-shell-subtitle">
          {authLoading ? (
            <AuthTextSkeleton width={180} />
          ) : loggedIn ? (
            profileLoading ? (
              "アカウント情報を読み込んでいます"
            ) : (
              accountLabel
            )
          ) : (
            "Google でログインしてクラスに参加できます"
          )}
        </p>
      </header>

      {authLoading ? (
        <AppShellSection title="アカウント">
          <AuthLoadingBanner
            slow={slow}
            error={authError}
            onReload={() => {
              window.location.reload();
            }}
          />
        </AppShellSection>
      ) : null}

      {!loggedIn && !authLoading ? (
        <AppShellSection title="アカウント">
          <p className="app-shell-muted" style={{ margin: "0 0 12px" }}>
            アカウントを連携すると、クラスや設定を端末間で引き継げます。
          </p>
          <Link
            href={withDev(buildShellAwareLoginUrl(returnPath))}
            className="app-shell-btn app-shell-btn--primary"
            style={{ width: "100%" }}
          >
            Google でログイン
          </Link>
        </AppShellSection>
      ) : null}

      <div className="app-shell-home-layout">
        <AppShellSection title="所属クラス">
          {authLoading || classesLoading ? (
            <AuthCardSkeleton />
          ) : hasMembership ? (
            <div style={{ display: "grid", gap: 12 }}>
              {joinedClasses.map((row) => {
                const opening = openingClassId === row.classId;
                return (
                  <div
                    key={row.classId}
                    className="app-shell-info-box"
                    style={{ display: "grid", gap: 10 }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
                        {row.name}
                      </p>
                      {row.topicTitle ? (
                        <p className="app-shell-muted" style={{ margin: "6px 0 0" }}>
                          {row.topicTitle}
                        </p>
                      ) : null}
                      {row.statusLabel ? (
                        <p className="app-shell-muted" style={{ margin: "4px 0 0" }}>
                          {row.statusLabel}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="app-shell-btn app-shell-btn--primary"
                      disabled={Boolean(openingClassId) || actionsLocked}
                      onClick={() => void onEnterClass(row)}
                    >
                      {opening ? "入室中…" : "クラスに戻る"}
                    </button>
                  </div>
                );
              })}
              {openError ? (
                <p className="app-shell-error" style={{ margin: 0 }}>
                  {openError}
                </p>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <p className="app-shell-muted" style={{ margin: 0 }}>
                まだクラスに参加していません。新しいクラスを探してみましょう。
              </p>
              <button
                type="button"
                className="app-shell-btn app-shell-btn--primary"
                disabled={actionsLocked}
                onClick={() => router.push(withDev("/class/select"))}
              >
                新しく参加する
              </button>
            </div>
          )}
        </AppShellSection>

        <section className="app-shell-actions app-shell-actions--grid">
          {authLoading || profileLoading ? (
            <AuthCardSkeleton />
          ) : (
            <>
              {hasMembership ? (
                <button
                  type="button"
                  className="app-shell-btn"
                  disabled={actionsLocked}
                  onClick={() => router.push(withDev("/class/select"))}
                >
                  新しく参加する
                </button>
              ) : null}

              <Link
                href={withDev(buildProfileEditPath(returnPath))}
                className="app-shell-btn"
              >
                {hasProfile ? "プロフィール" : "プロフィール登録"}
              </Link>
            </>
          )}
        </section>
      </div>
    </AppShellPage>
  );
}
