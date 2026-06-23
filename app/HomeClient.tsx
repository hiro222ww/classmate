"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { isValidDeviceUuid } from "@/lib/deviceIdValidation";
import {
  logDeviceEnsureFailed,
  logDeviceEnsureStart,
  logDeviceEnsureSuccess,
  logHomeEntryStart,
  logProfileExists,
} from "@/lib/entryFlowLog";
import { DevPanel } from "@/components/DevPanel";
import { HelpTip } from "@/components/HelpTip";
import { AgeFilterCard } from "@/components/dashboard/AgeFilterCard";
import { JoinNewCard } from "@/components/dashboard/JoinNewCard";
import { ReturnClassCard } from "@/components/dashboard/ReturnClassCard";
import { useCurrentClass } from "@/components/dashboard/useCurrentClass";
import {
  DASH_CARD,
  HOME_DASHBOARD_LAYOUT_CSS,
  PRIMARY_BTN,
} from "@/components/dashboard/dashboardStyles";
import MemberProfileModal from "@/components/MemberProfileModal";
import { withDev } from "@/lib/withDev";
import { getClassStatusLabel, isSessionEligibleForNormalJoin } from "@/lib/recruitment";
import { buildMatchJoinRequestBody } from "@/lib/matchJoinRequest";
import {
  DISPLAY_NAME_FALLBACK,
  formatMemberDisplayName,
  logMemberDisplayNamesFromApi,
} from "@/lib/resolveDisplayName";
import {
  consumeJoinedClassesRefresh,
  peekJoinedClassesRefresh,
} from "@/lib/joinedClassesRefresh";
import {
  getMemberAvatarUrl,
  LIST_MEMBER_AVATAR_PX,
  normalizeMemberDeviceId,
  type MemberProfileTarget,
} from "@/lib/memberProfileView";
import MeetingPlanSection from "@/components/MeetingPlanSection";
import CallRequestSection from "@/components/CallRequestSection";
import InAppToastStack, {
  type InAppToastItem,
} from "@/components/InAppToastStack";
import {
  isWebPushSupported,
  subscribeWebPush,
  unsubscribeWebPush,
} from "@/lib/webPushClient";
import type { MeetingPlanPublic } from "@/lib/meetingPlanClient";
import type { CallRequestPublic } from "@/lib/callRequest";
import { hasLocalLeftCall } from "@/lib/localCallExit";
import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";
import { openJoinedClassRoom } from "@/lib/openJoinedClassClient";
import { markAutoCallOnce } from "@/lib/autoCallOnce";
import { CLASS_LEAVE_CONFIRMED_SOURCE } from "@/lib/classLeaveSource";
import {
  clearLocallyHiddenClass,
  isLocallyHiddenClass,
} from "@/lib/localHiddenClasses";
import {
  clearClassLeftLocally,
  isClassLeftLocally,
  logHomeOpenClassBlocked,
  markClassLeftLocally,
} from "@/lib/leftClassMembership";
import {
  clearHomeClassSessionHint,
  readHomeClassSessionHint,
  storeHomeClassSessionHint,
} from "@/lib/homeClassSessionHint";
import { isUserProfileComplete } from "@/lib/profileClient";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import {
  logParticipationStatusDecision,
  mapPresenceApiRow,
  participationStatusLabel,
  participationStatusStyle,
  PRESENCE_FRESH_MS_HOME,
  resolveParticipationDisplay,
  resolveParticipationStatus,
  type ParticipationSource,
  type UiParticipationStatus,
} from "@/lib/memberPresenceStatus";
import {
  countPresenceStates,
  getPresenceFreshMsForContext,
  logMemberSource,
} from "@/lib/sessionMemberListMerge";
import {
  logHomeFirstPaint,
  logHomeJoinedClasses,
  logHomeOpenClassPerf,
  logHomePerf,
} from "@/lib/homePerf";

type Profile = {
  device_id: string;
  display_name: string;
  birth_date?: string | null;
  gender?: string | null;
};

type MineClass = {
  class_id: string;
  join_ok?: boolean;
  id: string;
  name: string;
  description: string;
  world_key: string | null;
  topic_key: string | null;
  topic_title?: string | null;
  topic_description?: string | null;
  min_age: number;
  is_sensitive: boolean;
  is_user_created: boolean;
  created_at: string | null;

  match_deadline_at?: string | null;
  has_active_session?: boolean;
  session_id?: string | null;
  session_status?: string | null;
  session_created_at?: string | null;
  status_label?: string | null;
  is_recruiting?: boolean;
  next_meeting_plan?: MeetingPlanPublic | null;
  active_call_request?: CallRequestPublic | null;
  unread_count?: number;
};

type ClassMember = {
  device_id: string;
  display_name: string;
  display_name_source?: string | null;
  photo_path?: string | null;
  joined_at?: string | null;
  is_in_call?: boolean;
  screen?: string | null;
  last_seen_at?: string | null;
  presence_session_id?: string | null;
};

type PresenceRow = ParticipationSource & {
  device_id: string;
};

type ClassMessage = {
  id: number;
  class_id: string;
  device_id: string;
  message: string;
  msg_type?: string | null;
  created_at?: string | null;
};

function formatClassLabel(c: MineClass): string {
  const raw = String(c.name || "").trim();
  if (!raw) return "クラス";

  const match = raw.match(/クラス\d+[A-Z]/);
  return match ? match[0] : raw;
}

async function readJsonSafe(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function mergeMemberPresenceSource(
  member: ClassMember,
  presence?: PresenceRow
): ParticipationSource {
  return {
    is_in_call: member.is_in_call === true ? true : presence?.is_in_call,
    screen: member.screen ?? presence?.screen ?? null,
    session_id: presence?.session_id ?? member.presence_session_id ?? null,
    presence_session_id:
      member.presence_session_id ??
      presence?.presence_session_id ??
      presence?.session_id ??
      null,
    last_seen_at: member.last_seen_at ?? presence?.last_seen_at ?? null,
    effective_status: presence?.effective_status ?? presence?.status ?? null,
    status: presence?.status ?? null,
  };
}

function resolveHomeMemberParticipation(
  member: ClassMember,
  presence: PresenceRow | undefined,
  sessionId: string | null | undefined,
  previous: UiParticipationStatus | null,
  fetchFailed = false,
  lastInSessionAt?: number | null,
  inSessionMembers = false,
  previousInternal?: import("@/lib/memberStatus").InternalMemberStatus | null
): UiParticipationStatus {
  const deviceId = String(member.device_id ?? "").trim();
  const localExitedCall = hasLocalLeftCall(sessionId, deviceId);

  return resolveParticipationStatus({
    source: mergeMemberPresenceSource(member, presence),
    currentSessionId: sessionId,
    freshMs: PRESENCE_FRESH_MS_HOME,
    previous,
    previousInternal,
    fetchFailed,
    localExitedCall,
    context: "home",
    deviceId,
    inSessionMembers,
    inClassMembership: true,
    lastInSessionAt,
  });
}

function deriveClassParticipationLabel(
  sessionId: string | null | undefined,
  members: ClassMember[],
  presenceMap: Record<string, PresenceRow>,
  prevStatuses: Record<string, UiParticipationStatus>,
  lastInSessionAtMap: Record<string, number> = {},
  sessionMemberIds: Set<string> = new Set()
): string | null {
  if (!String(sessionId ?? "").trim()) return null;

  let inCall = 0;
  let waiting = 0;

  for (const member of members) {
    const deviceId = String(member.device_id ?? "").trim();
    if (!deviceId) continue;

    const display = resolveParticipationDisplay({
      source: mergeMemberPresenceSource(member, presenceMap[deviceId]),
      currentSessionId: sessionId,
      freshMs: PRESENCE_FRESH_MS_HOME,
      previous: prevStatuses[deviceId] ?? null,
      context: "home",
      deviceId,
      inSessionMembers: sessionMemberIds.has(deviceId),
      inClassMembership: true,
      lastInSessionAt: lastInSessionAtMap[deviceId],
    });

    if (display.internal === "in_voice") inCall += 1;
    else if (display.internal === "in_room") waiting += 1;
  }

  if (inCall > 0) return "通話中";
  if (waiting > 0) return "待機中";
  return null;
}

function summarizeMemberParticipation(
  members: ClassMember[],
  presenceMap: Record<string, PresenceRow>,
  sessionId: string | null | undefined,
  prevStatuses: Record<string, UiParticipationStatus>,
  lastInSessionAtMap: Record<string, number> = {},
  sessionMemberIds: Set<string> = new Set()
) {
  let inCall = 0;
  let waiting = 0;

  for (const member of members) {
    const deviceId = String(member.device_id ?? "").trim();
    if (!deviceId) continue;

    const display = resolveParticipationDisplay({
      source: mergeMemberPresenceSource(member, presenceMap[deviceId]),
      currentSessionId: sessionId,
      freshMs: PRESENCE_FRESH_MS_HOME,
      previous: prevStatuses[deviceId] ?? null,
      context: "home",
      deviceId,
      inSessionMembers: sessionMemberIds.has(deviceId),
      inClassMembership: true,
      lastInSessionAt: lastInSessionAtMap[deviceId],
    });

    if (display.internal === "in_voice") inCall += 1;
    else if (display.internal === "in_room") waiting += 1;
  }

  return { inCall, waiting };
}

function getClassStatusStyle(label: string) {
  if (label === "通話中") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }

  if (label === "募集中") {
    return {
      background: "#dbeafe",
      color: "#1d4ed8",
      border: "1px solid #93c5fd",
    };
  }

  if (label === "募集締切" || label === "募集停止" || label === "募集終了") {
    return {
      background: "#f3f4f6",
      color: "#6b7280",
      border: "1px solid #d1d5db",
    };
  }

  if (label === "待機中") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fcd34d",
    };
  }

  if (label === "入室中" || label === "所属中") {
    return {
      background: "#e0e7ff",
      color: "#3730a3",
      border: "1px solid #a5b4fc",
    };
  }

  return {
    background: "#f9fafb",
    color: "#6b7280",
    border: "1px solid #e5e7eb",
  };
}

function pushBrowserNotification(
  enabled: boolean,
  title: string,
  body: string
) {
  if (!enabled) return;
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  new Notification(title, { body });
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "5px 10px",
        borderRadius: 999,
        background: "#f3f4f6",
        color: "#4b5563",
        fontWeight: 800,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </span>
  );
}

export default function HomeClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const dev = (searchParams.get("dev") ?? "").trim();

  function buildRoomUrl(
    classId: string,
    sessionId: string,
    opts?: { openJoinedClass?: boolean }
  ) {
    return withDev(
      `/room?autojoin=1&classId=${encodeURIComponent(
        classId
      )}&sessionId=${encodeURIComponent(sessionId)}` +
        (opts?.openJoinedClass ? "&openJoinedClass=1" : "")
    );
  }

  const [deviceId, setDeviceId] = useState("");
  const {
    loading: currentClassLoading,
    current: currentClass,
    refresh: refreshCurrentClass,
  } = useCurrentClass(deviceId);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [classes, setClasses] = useState<MineClass[]>([]);
  const [recruitmentSessionTtlMinutes, setRecruitmentSessionTtlMinutes] =
    useState<number | null>(5);
  const [recruitmentSessionTtlUnlimited, setRecruitmentSessionTtlUnlimited] =
    useState(false);
  const [error, setError] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [joinWindowOpen, setJoinWindowOpen] = useState(true);
  const [joinWindowText, setJoinWindowText] = useState("");
  const [openingClassId, setOpeningClassId] = useState<string | null>(null);
  const [leavingClassId, setLeavingClassId] = useState<string | null>(null);

  const [membersByClass, setMembersByClass] = useState<Record<string, ClassMember[]>>({});
  const [presenceByClass, setPresenceByClass] = useState<
    Record<string, Record<string, PresenceRow>>
  >({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [profileTarget, setProfileTarget] = useState<MemberProfileTarget | null>(
    null
  );

  const prevPresenceRef = useRef<Record<string, Record<string, PresenceRow>>>({});
  const prevMembersRef = useRef<Record<string, ClassMember[]>>({});
  const prevMemberStatusRef = useRef<
    Record<string, Record<string, UiParticipationStatus>>
  >({});
  const lastInSessionAtByClassRef = useRef<
    Record<string, Record<string, number>>
  >({});
  const sessionMemberIdsByClassRef = useRef<Record<string, Set<string>>>({});
  const prevMemberInternalRef = useRef<
    Record<string, Record<string, import("@/lib/memberStatus").InternalMemberStatus>>
  >({});
  const prevMessageIdsRef = useRef<Record<string, number>>({});
  const inviteRetryTimerRef = useRef<number | null>(null);
  const lastNotificationSinceRef = useRef<string | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const toastTimersRef = useRef<Map<string, number>>(new Map());
  const openClassRef = useRef<(target: MineClass) => Promise<void>>(async () => {});
  const handledPushOpenClassIdRef = useRef<string | null>(null);
  const leavingClassIdsRef = useRef<Set<string>>(new Set());
  const fetchJoinedClassesGenRef = useRef(0);
  const leftSucceededClassIdsRef = useRef<Set<string>>(new Set());
  const homeMountStartMsRef = useRef<number | null>(null);
  const homeEnrichStartedRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [inAppToasts, setInAppToasts] = useState<InAppToastItem[]>([]);

  const fetchJoinedClasses = useCallback(
    async (
      reason: string,
      opts?: {
        deviceId?: string;
        throwOnError?: boolean;
        expectedClassId?: string | null;
        lite?: boolean;
      }
    ) => {
      const fetchGen = fetchJoinedClassesGenRef.current;
      const lite = opts?.lite === true;
      console.log(
        `[home-fetch] start gen=${fetchGen} reason=${reason} lite=${lite ? 1 : 0}`
      );

      const id = String(
        opts?.deviceId ?? deviceId ?? getDeviceId() ?? ""
      ).trim();

      if (!id) {
        console.warn("[home] fetchJoinedClasses skip: deviceId missing", {
          reason,
        });
        return;
      }

      try {
        const fetchStartMs = Date.now();
        const mineQs = new URLSearchParams({ deviceId: id });
        if (lite) {
          mineQs.set("lite", "1");
        }
        const classesRes = await fetch(
          `/api/class/mine?${mineQs.toString()}`,
          {
            cache: "no-store",
            headers: await buildDeviceAuthHeaders(id),
          }
        );
        const classesJson = await readJsonSafe(classesRes);
        const fetchMs = Date.now() - fetchStartMs;
        if (reason === "mount" || reason === "enrich") {
          logHomePerf({
            totalMs: fetchMs,
            path: lite ? "client_mine_lite" : "client_mine_full",
          });
        }

        if (!classesRes.ok || !classesJson?.ok) {
          console.warn("[home] fetchJoinedClasses failed", {
            reason,
            error: classesJson?.error,
          });
          if (opts?.throwOnError) {
            throw new Error(classesJson?.error || "class_mine_failed");
          }
          return;
        }

        const currentGen = fetchJoinedClassesGenRef.current;
        if (fetchGen !== currentGen) {
          console.log(
            `[home-fetch] ignored reason=stale_after_leave gen=${fetchGen} currentGen=${currentGen}`
          );
          return;
        }

        const rawClasses = Array.isArray(classesJson.classes)
          ? (classesJson.classes as MineClass[])
          : [];

        const nextClasses: MineClass[] = [];
        let localHiddenDetected = false;
        for (const rawClass of rawClasses) {
          let c = rawClass;
          const classId = String(c.id ?? "").trim();
          if (!classId) continue;

          if (leftSucceededClassIdsRef.current.has(classId)) {
            console.log(
              `[home-leave] rollback reason=server_still_active class=${classId.slice(-6)}`
            );
            leftSucceededClassIdsRef.current.delete(classId);
            clearClassLeftLocally(classId);
            clearLocallyHiddenClass(classId);
          } else {
            if (leavingClassIdsRef.current.has(classId)) {
              continue;
            }

            if (isLocallyHiddenClass(classId)) {
              localHiddenDetected = true;
              console.log(
                `[home] localHiddenDetected class=${classId.slice(-6)} action=clear reason=server_active_membership`
              );
              clearLocallyHiddenClass(classId);
            }

            if (isClassLeftLocally(classId)) {
              console.log(
                `[home] clear-local-left reason=server_active_membership class=${classId.slice(-6)}`
              );
              clearClassLeftLocally(classId);
            }
          }

          let sessionId = String(c.session_id ?? "").trim();
          if (!sessionId && lite) {
            const hintSessionId = readHomeClassSessionHint(classId);
            if (hintSessionId) {
              sessionId = hintSessionId;
              c = {
                ...c,
                session_id: hintSessionId,
              };
            }
          }
          if (sessionId) {
            storeHomeClassSessionHint(classId, sessionId, c.session_status);
          }

          nextClasses.push(c);
        }

        const classIds = nextClasses.map((c: MineClass) =>
          String(c.id ?? "").trim()
        );

        const slotCount = Number(classesJson.membership_count_billable ?? 0);
        const visibleClassIdsFromApi = Array.isArray(
          classesJson.debug?.visibility?.visibleClassIds
        )
          ? (classesJson.debug.visibility.visibleClassIds as string[])
          : classIds;
        const slotCountClassIds = Array.isArray(
          classesJson.debug?.visibility?.slotCountClassIds
        )
          ? (classesJson.debug.visibility.slotCountClassIds as string[])
          : visibleClassIdsFromApi;

        if (localHiddenDetected) {
          console.log("[home] localHiddenDetected=1 action=cleared_for_server_membership");
        }

        const visibleEqualsSlot =
          visibleClassIdsFromApi.length === slotCountClassIds.length &&
          visibleClassIdsFromApi.every(
            (cid, index) => cid === slotCountClassIds[index]
          );
        console.log(
          `[class-slots] device=${id.slice(-6)} limit=${String(classesJson.class_slots ?? "-")} ` +
            `count=${slotCount} slotCountClassIds=${slotCountClassIds.map((cid) => cid.slice(-6)).join(",") || "-"} ` +
            `visibleClassIds=${visibleClassIdsFromApi.map((cid) => cid.slice(-6)).join(",") || "-"} source=home_client`
        );
        console.log(
          visibleEqualsSlot
            ? `[class-slots] invariant-ok visibleEqualsSlot=1`
            : `[class-slots] invariant-violation visibleEqualsSlot=0`
        );

        if (slotCount > 0 && nextClasses.length === 0) {
          console.warn(
            `[home] joined-classes mismatch slotCount=${slotCount} visible=0 ` +
              `slotCountClassIds=${slotCountClassIds.map((cid) => cid.slice(-6)).join(",") || "-"}`
          );
        }

        if (classesJson.recruitment_session_ttl_unlimited === true) {
          setRecruitmentSessionTtlUnlimited(true);
          setRecruitmentSessionTtlMinutes(null);
        } else if (Number(classesJson.recruitment_session_ttl_minutes) > 0) {
          setRecruitmentSessionTtlUnlimited(false);
          setRecruitmentSessionTtlMinutes(
            Number(classesJson.recruitment_session_ttl_minutes)
          );
        }

        console.log(
          `[home] joined-classes source=class_memberships count=${nextClasses.length} ` +
            `classIds=${classIds.map((id) => id.slice(-6)).join(",") || "-"} reason=${reason}`
        );

        const applyClasses = nextClasses.filter((c) => {
          const classId = String(c.id ?? "").trim();
          if (!classId) return false;
          if (leftSucceededClassIdsRef.current.has(classId)) {
            console.log(`[home-leave] suppress class=${classId.slice(-6)}`);
            return false;
          }
          return true;
        });

        for (const suppressedId of [...leftSucceededClassIdsRef.current]) {
          const stillInRaw = rawClasses.some(
            (row) => String(row.id ?? "").trim() === suppressedId
          );
          if (!stillInRaw) {
            leftSucceededClassIdsRef.current.delete(suppressedId);
          }
        }

        setClasses((prev) => {
          const forceApply =
            reason === "invite_success" ||
            reason === "focus" ||
            reason === "visibility" ||
            reason === "manual";

          if (reason === "enrich" && prev.length > 0) {
            const byId = new Map(
              prev.map((row) => [String(row.id ?? "").trim(), row])
            );
            for (const row of applyClasses) {
              const classId = String(row.id ?? "").trim();
              if (!classId) continue;
              const existing = byId.get(classId);
              byId.set(
                classId,
                existing
                  ? {
                      ...existing,
                      ...row,
                      session_id:
                        row.session_id ?? existing.session_id ?? null,
                      status_label:
                        row.status_label ?? existing.status_label ?? "所属中",
                    }
                  : row
              );
            }
            return Array.from(byId.values()).sort((a, b) => {
              const at = a.created_at ? new Date(a.created_at).getTime() : 0;
              const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
              return bt - at;
            });
          }

          if (
            !forceApply &&
            prev.length > 0 &&
            applyClasses.length === 0 &&
            slotCount <= 0
          ) {
            console.warn("[home] ignore empty classes snapshot once");
            return prev.filter(
              (c) =>
                !leftSucceededClassIdsRef.current.has(String(c.id ?? "").trim())
            );
          }

          return applyClasses;
        });

        const expectedClassId = String(opts?.expectedClassId ?? "").trim();
        if (
          expectedClassId &&
          reason === "invite_success" &&
          !classIds.includes(expectedClassId)
        ) {
          if (inviteRetryTimerRef.current) {
            window.clearTimeout(inviteRetryTimerRef.current);
          }

          console.log("[home] fetchJoinedClasses retry scheduled", {
            expectedClassId,
          });

          inviteRetryTimerRef.current = window.setTimeout(() => {
            inviteRetryTimerRef.current = null;
            void fetchJoinedClasses("invite_success", {
              deviceId: id,
            });
          }, 800);
        }
      } catch (e) {
        console.error("[home] fetchJoinedClasses error", { reason, e });
        if (opts?.throwOnError) throw e;
      }
    },
    [deviceId]
  );

  useEffect(() => {
    setMounted(true);

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("notifications_enabled");
      setNotificationsEnabled(saved === "true");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!deviceId || !notificationsEnabled || !mounted) return;

    void subscribeWebPush(deviceId)
      .then((result) => {
        if (!result.ok && result.error !== "permission_denied") {
          console.warn("[home] web push resubscribe failed", result.error);
        }
      })
      .catch((e) => {
        console.warn("[home] web push resubscribe error", e);
      });
  }, [deviceId, notificationsEnabled, mounted]);

  useEffect(() => {
    let cancelled = false;

    async function reloadJoinWindow() {
      try {
        const res = await fetch("/api/admission/status", { cache: "no-store" });
        const json = await readJsonSafe(res);

        console.log("[home] admission status =", json);

        if (cancelled) return;

        if (!res.ok || !json?.ok) {
          setJoinWindowOpen(true);
          setJoinWindowText("");
          return;
        }

        setJoinWindowOpen(Boolean(json.open));
        setJoinWindowText(String(json.text ?? ""));
      } catch (e) {
        console.warn("[home] admission status load failed", e);
        if (!cancelled) {
          setJoinWindowOpen(true);
          setJoinWindowText("");
        }
      }
    }

    void reloadJoinWindow();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void reloadJoinWindow();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(reloadJoinWindow, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  

  useEffect(() => {
    let cancelled = false;
    homeMountStartMsRef.current = Date.now();
    homeEnrichStartedRef.current = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        setProfile(null);
        setClasses([]);
        setMembersByClass({});
        setPresenceByClass({});

        const id = String(getDeviceId() ?? "").trim();

        if (!cancelled) setDeviceId(id);

        if (!id) {
          console.warn("[home] deviceId missing on init");
          setProfile(null);
          setClasses([]);
          setError("device_id_missing");
          return;
        }

        logHomeEntryStart(id);
        if (!isValidDeviceUuid(id)) {
          logDeviceEnsureFailed(id, "invalid_uuid_format");
        } else {
          logDeviceEnsureStart(id);
          logDeviceEnsureSuccess(id, "home_mount");
        }

        const refreshFromQuery =
          (searchParams.get("refreshClasses") ?? "").trim() === "1";
        const refreshFromStorage = consumeJoinedClassesRefresh();
        const fetchReason =
          refreshFromQuery || refreshFromStorage.pending
            ? "invite_success"
            : "mount";

        const profilePromise = fetch(
          `/api/profile?device_id=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        ).catch(() => null);

        if (fetchReason === "mount") {
          await fetchJoinedClasses("mount", {
            deviceId: id,
            throwOnError: true,
            lite: true,
          });
        } else {
          await fetchJoinedClasses(fetchReason, {
            deviceId: id,
            throwOnError: true,
            expectedClassId: refreshFromStorage.classId,
          });
        }

        if (!cancelled) {
          const mountMs =
            homeMountStartMsRef.current != null
              ? Date.now() - homeMountStartMsRef.current
              : 0;
          logHomeJoinedClasses(mountMs);
          logHomeFirstPaint(mountMs);
          setLoading(false);

          if (!homeEnrichStartedRef.current && fetchReason === "mount") {
            homeEnrichStartedRef.current = true;
            window.setTimeout(() => {
              void fetchJoinedClasses("enrich", { deviceId: id });
            }, 0);
          }
        }

        const profileRes = await profilePromise;
        if (cancelled || !profileRes) return;

        if (profileRes.ok) {
          const profileJson = await readJsonSafe(profileRes);
          const nextProfile =
            profileJson?.profile && typeof profileJson.profile === "object"
              ? profileJson.profile
              : profileJson?.device_id
                ? profileJson
                : null;

          setProfile(nextProfile);
          logProfileExists(
            id,
            Boolean(
              nextProfile &&
                typeof nextProfile === "object" &&
                String((nextProfile as { display_name?: string }).display_name ?? "").trim()
            )
          );
        } else {
          setProfile(null);
          logProfileExists(id, false);
        }
      } catch (e: any) {
        console.error("[home] load error", e);
        if (!cancelled) {
          setError(e?.message || "読み込みに失敗しました");
          setClasses([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (inviteRetryTimerRef.current) {
        window.clearTimeout(inviteRetryTimerRef.current);
        inviteRetryTimerRef.current = null;
      }
    };
  }, [dev, fetchJoinedClasses, searchParams]);

  useEffect(() => {
    function runRefresh(reason: "focus" | "visibility") {
      void refreshCurrentClass();
      const pending = peekJoinedClassesRefresh();
      if (pending.pending) {
        const consumed = consumeJoinedClassesRefresh();
        void fetchJoinedClasses("invite_success", {
          expectedClassId: consumed.classId,
        });
        return;
      }

      void fetchJoinedClasses(reason);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        runRefresh("visibility");
      }
    };

    const onFocus = () => {
      runRefresh("focus");
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void refreshCurrentClass();
        const pending = consumeJoinedClassesRefresh();
        void fetchJoinedClasses(
          pending.pending ? "invite_success" : "focus",
          { expectedClassId: pending.classId }
        );
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [fetchJoinedClasses, refreshCurrentClass]);

  useEffect(() => {
    if (!deviceId) return;
    if (!classes.length) return;

    const timer = window.setInterval(() => {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }

  classes.forEach((c) => {
        fetch("/api/class/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classId: c.id,
            deviceId,
            screen: "home",
            sessionId: null,
          }),
          cache: "no-store",
        }).catch((e) => {
          console.warn("[home] presence heartbeat failed", c.id, e);
        });
      });
    }, 15000);

    classes.forEach((c) => {
      fetch("/api/class/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId: c.id,
          deviceId,
          screen: "home",
          sessionId: null,
        }),
        cache: "no-store",
      }).catch((e) => {
        console.warn("[home] initial presence heartbeat failed", c.id, e);
      });
    });

    return () => {
      window.clearInterval(timer);
    };
  }, [deviceId, classes]);

  
  useEffect(() => {
    if (!classes.length) return;

    let cancelled = false;
    const membersDeferMs = 150;

async function loadMembersAndPresence() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }

  const classIds = classes.map((c) => c.id).filter(Boolean);
  const viewerId = String(deviceId ?? "").trim();
  let shouldRefreshJoinedClasses = false;
  try {
    
    const results = await Promise.all(
  classIds.map(async (classId) => {
    try {
      let members: ClassMember[] = [];
      let presence: PresenceRow[] = [];
      let fetchFailed = false;
      let membersFetchFailed = false;
      let presenceFetchFailed = false;
      let sessionStatusFetchFailed = false;

const classRow = classes.find((c) => c.id === classId);
const sessionId = String(classRow?.session_id ?? "").trim();

// membersは必ず取得（session_id があれば session_members 優先）
try {
  const membersUrl = sessionId
    ? `/api/class/members?classId=${encodeURIComponent(classId)}&sessionId=${encodeURIComponent(sessionId)}`
    : `/api/class/members?classId=${encodeURIComponent(classId)}`;
  const membersRes = await fetch(membersUrl, { cache: "no-store" });
  const membersJson = await readJsonSafe(membersRes);
  members = Array.isArray(membersJson?.members)
    ? membersJson.members
    : [];
} catch (e) {
  membersFetchFailed = true;
  console.warn("[home] members load failed", classId, e);
}

let sessionMemberIds = new Set<string>();

if (sessionId) {
  try {
    const statusQs = new URLSearchParams({
      sessionId,
      classId,
    });
    const statusRes = await fetch(
      `/api/session/status?${statusQs.toString()}`,
      { cache: "no-store" }
    );
    const statusJson = await readJsonSafe(statusRes);

    if (statusJson?.ok && Array.isArray(statusJson.members)) {
      const statusMembers = statusJson.members as ClassMember[];
      const statusByDevice = new Map<string, ClassMember>();
      sessionMemberIds = new Set<string>();

      for (const row of statusMembers) {
        const did = String(row.device_id ?? "").trim();
        if (!did) continue;
        statusByDevice.set(did, row);
        sessionMemberIds.add(did);
      }

      const merged: ClassMember[] = [];
      const seen = new Set<string>();

      for (const member of members) {
        const did = String(member.device_id ?? "").trim();
        if (!did) continue;
        seen.add(did);
        const statusMember = statusByDevice.get(did);
        merged.push(
          statusMember
            ? {
                ...member,
                is_in_call: statusMember.is_in_call === true,
                screen: statusMember.screen ?? member.screen ?? null,
                last_seen_at:
                  statusMember.last_seen_at ?? member.last_seen_at ?? null,
                presence_session_id:
                  statusMember.presence_session_id ??
                  member.presence_session_id ??
                  null,
              }
            : member
        );
      }

      for (const row of statusMembers) {
        const did = String(row.device_id ?? "").trim();
        if (!did || seen.has(did)) continue;
        merged.push(row);
      }

      members = merged;
    } else {
      sessionStatusFetchFailed = true;
      console.warn("[home] session/status load failed", classId, statusJson?.error);
    }
  } catch (e) {
    sessionStatusFetchFailed = true;
    console.warn("[home] session/status load failed", classId, e);
  }
}

if (
  viewerId &&
  sessionMemberIds.has(viewerId) &&
  isLocallyHiddenClass(classId) &&
  !isClassLeftLocally(classId)
) {
  console.log(
    `[home] clear-local-hidden reason=session_members_exists class=${classId.slice(-6)}`
  );
  clearLocallyHiddenClass(classId);
  shouldRefreshJoinedClasses = true;
}

// presenceは失敗してもOK
try {
  const presenceRes = await fetch(
    `/api/class/presence?classId=${encodeURIComponent(classId)}`,
    { cache: "no-store" }
  );
  const presenceJson = await readJsonSafe(presenceRes);
  const presenceItems = Array.isArray(presenceJson?.items)
    ? presenceJson.items
    : Array.isArray(presenceJson?.presence)
      ? presenceJson.presence
      : [];

  const presenceMap: Record<string, PresenceRow> = {};
  let ignoredNonMember = 0;
  let ignoredStale = 0;
  for (const raw of presenceItems) {
    const mapped = mapPresenceApiRow(raw as Record<string, unknown>, sessionId);
    if (!mapped) continue;
    const did = String(mapped.device_id ?? "").trim();
    if (!did) continue;
    if (sessionMemberIds.size > 0 && !sessionMemberIds.has(did)) {
      ignoredNonMember += 1;
      continue;
    }
    const seen = mapped.last_seen_at;
    const t = seen ? new Date(seen).getTime() : NaN;
    const fresh =
      Number.isFinite(t) && Date.now() - t <= PRESENCE_FRESH_MS_HOME;
    if (!fresh) {
      ignoredStale += 1;
      if (sessionMemberIds.has(did)) {
        presenceMap[did] = mapped;
        console.log(
          `[presence] stale device=${did.slice(-4)} keptInMembers=1 context=home`
        );
      }
      continue;
    }
    presenceMap[did] = mapped;
  }
  if (ignoredNonMember > 0 || ignoredStale > 0) {
    console.log(
      `[home] presence filtered class=${classId.slice(-6)} ` +
        `ignoredNonMember=${ignoredNonMember} ignoredStale=${ignoredStale} ` +
        `kept=${Object.keys(presenceMap).length}`
    );
  }
  presence = Object.values(presenceMap);
} catch (e) {
  presenceFetchFailed = true;
  console.warn("[home] presence load failed", classId, e);
}

fetchFailed =
  membersFetchFailed || presenceFetchFailed || sessionStatusFetchFailed;

return {
  classId,
  members,
  presence,
  fetchFailed,
  sessionMemberIds,
};
    } catch (e) {
      console.warn("[home] partial members/presence load failed", classId, e);

      return {
        classId,
        members: null,
        presence: null,
        fetchFailed: true,
        sessionMemberIds: new Set<string>(),
      };
    }
  })
);

        if (shouldRefreshJoinedClasses && !cancelled) {
          void fetchJoinedClasses("session_members_exists", { deviceId });
        }

        if (cancelled) return;

        const nextMembersByClass: Record<string, ClassMember[]> = {};
        const nextPresenceByClass: Record<string, Record<string, PresenceRow>> = {};
        const nextMemberStatusByClass: Record<
          string,
          Record<string, UiParticipationStatus>
        > = {};
        const nextMemberInternalByClass: Record<
          string,
          Record<string, import("@/lib/memberStatus").InternalMemberStatus>
        > = {};

        for (const row of results) {
          const sessionMemberIds =
            row.sessionMemberIds ?? new Set<string>();
          sessionMemberIdsByClassRef.current[row.classId] = sessionMemberIds;

          if (row.fetchFailed || row.members == null || row.presence == null) {
            nextMembersByClass[row.classId] =
              prevMembersRef.current[row.classId] ??
              membersByClass[row.classId] ??
              [];
            nextPresenceByClass[row.classId] =
              prevPresenceRef.current[row.classId] ??
              presenceByClass[row.classId] ??
              {};
            nextMemberStatusByClass[row.classId] =
              prevMemberStatusRef.current[row.classId] ?? {};
            continue;
          }

          nextMembersByClass[row.classId] = row.members;
          logMemberDisplayNamesFromApi(
            `home:${row.classId.slice(0, 8)}`,
            row.members
          );

          const presenceMap: Record<string, PresenceRow> = {};
          for (const p of row.presence) {
            const key = String(p.device_id ?? "").trim();
            if (!key) continue;
            presenceMap[key] = p;
          }
          nextPresenceByClass[row.classId] = presenceMap;

          const classRow = classes.find((c) => c.id === row.classId);
          const sessionId = String(classRow?.session_id ?? "").trim();
          const prevStatuses =
            prevMemberStatusRef.current[row.classId] ?? {};
          const statusMap: Record<string, UiParticipationStatus> = {};
          const lastInSessionMap: Record<string, number> = {
            ...(lastInSessionAtByClassRef.current[row.classId] ?? {}),
          };
          const nowMs = Date.now();

          for (const member of row.members) {
            const memberId = String(member.device_id ?? "").trim();
            if (!memberId) continue;

            const inSession = sessionMemberIds.has(memberId);
            if (inSession) {
              lastInSessionMap[memberId] = nowMs;
            }

            const display = resolveParticipationDisplay({
              source: mergeMemberPresenceSource(
                member,
                presenceMap[memberId]
              ),
              currentSessionId: sessionId || null,
              freshMs: PRESENCE_FRESH_MS_HOME,
              previous: prevStatuses[memberId] ?? null,
              previousInternal:
                prevMemberInternalRef.current[row.classId]?.[memberId] ?? null,
              fetchFailed: row.fetchFailed,
              localExitedCall: hasLocalLeftCall(sessionId, memberId),
              context: "home",
              deviceId: memberId,
              inSessionMembers: inSession,
              inClassMembership: true,
              lastInSessionAt: inSession
                ? lastInSessionMap[memberId]
                : undefined,
            });
            const status = display.participation;
            statusMap[memberId] = status;
            if (!nextMemberInternalByClass[row.classId]) {
              nextMemberInternalByClass[row.classId] = {};
            }
            nextMemberInternalByClass[row.classId][memberId] =
              display.internal;

            const prevStatus = prevStatuses[memberId] ?? null;
            if (prevStatus !== status) {
              logParticipationStatusDecision({
                context: "home",
                deviceId: memberId,
                label: display.label,
                status,
                used: member.is_in_call
                  ? "is_in_call"
                  : presenceMap[memberId]
                    ? "presence"
                    : "member_fields",
                sources: {
                  is_in_call: member.is_in_call ?? null,
                  screen: member.screen ?? presenceMap[memberId]?.screen ?? null,
                  last_seen_at:
                    member.last_seen_at ??
                    presenceMap[memberId]?.last_seen_at ??
                    null,
                  presence_session_id:
                    member.presence_session_id ??
                    presenceMap[memberId]?.presence_session_id ??
                    null,
                  sessionId: sessionId || null,
                  fetchFailed: row.fetchFailed,
                },
              });
            }
          }

          nextMemberStatusByClass[row.classId] = statusMap;
          prevMemberInternalRef.current[row.classId] =
            nextMemberInternalByClass[row.classId] ?? {};
          lastInSessionAtByClassRef.current[row.classId] = lastInSessionMap;
        }

        const prev = prevPresenceRef.current;
        const prevStatusesAll = prevMemberStatusRef.current;

        for (const c of classes) {
          const classId = c.id;
          const classTitle = formatClassLabel(c);
          const sessionId = String(c.session_id ?? "").trim();
          const members = nextMembersByClass[classId] ?? [];
          const presenceMap = nextPresenceByClass[classId] ?? {};
          const prevPresenceMap = prev[classId] ?? {};
          const prevStatusMap = prevStatusesAll[classId] ?? {};
          const lastInSessionAtMap =
            lastInSessionAtByClassRef.current[classId] ?? {};
          const sessionMemberIds =
            sessionMemberIdsByClassRef.current[classId] ?? new Set<string>();
          const freshMs = getPresenceFreshMsForContext("home");
          const presenceCounts = countPresenceStates(members, freshMs);
          logMemberSource({
            context: "home",
            sessionId: sessionId || undefined,
            sessionMembers: sessionMemberIds.size || members.length,
            presenceActive: presenceCounts.presenceActive,
            presenceStale: presenceCounts.presenceStale,
            displayMembers: members.length,
            extra: `class=${classId.slice(-6)}`,
          });

          for (const member of members) {
            const memberId = String(member.device_id ?? "").trim();
            if (!memberId || memberId === deviceId) continue;

            const inSession = sessionMemberIds.has(memberId);
            const prevDisplay =
              prevStatusMap[memberId] != null
                ? {
                    participation: prevStatusMap[memberId]!,
                    internal:
                      prevMemberInternalRef.current[classId]?.[memberId] ??
                      null,
                  }
                : null;
            const prevStatus = prevDisplay?.participation ?? null;
            const nextDisplay =
              nextMemberStatusByClass[classId]?.[memberId] != null
                ? {
                    participation:
                      nextMemberStatusByClass[classId]![memberId]!,
                    internal:
                      prevMemberInternalRef.current[classId]?.[memberId] ??
                      null,
                  }
                : resolveParticipationDisplay({
                    source: mergeMemberPresenceSource(
                      member,
                      presenceMap[memberId]
                    ),
                    currentSessionId: sessionId || null,
                    freshMs: PRESENCE_FRESH_MS_HOME,
                    previous: prevStatus,
                    previousInternal: prevDisplay?.internal ?? null,
                    context: "home",
                    deviceId: memberId,
                    inSessionMembers: inSession,
                    inClassMembership: true,
                    lastInSessionAt: inSession
                      ? lastInSessionAtMap[memberId]
                      : undefined,
                  });
            const nextStatus = nextDisplay.participation;

            if (
              prevStatus !== "in_call" &&
              nextStatus === "in_call" &&
              nextDisplay.internal === "in_voice"
            ) {
              pushBrowserNotification(
                notificationsEnabled,
                "通話が始まりました",
                `${formatMemberDisplayName(member)}さんが「${classTitle}」で通話中です`
              );
            }

            if (
              prevStatus === "offline" &&
              (nextStatus === "waiting" || nextStatus === "in_call")
            ) {
              pushBrowserNotification(
                notificationsEnabled,
                "クラスメートがオンラインになりました",
                `${formatMemberDisplayName(member)}さんが「${classTitle}」に来ています`
              );
            }
          }
        }

        prevPresenceRef.current = nextPresenceByClass;
        prevMembersRef.current = nextMembersByClass;
        prevMemberStatusRef.current = nextMemberStatusByClass;
        setMembersByClass(nextMembersByClass);
        setPresenceByClass(nextPresenceByClass);
      } catch (e) {
        console.error("[home] members/presence load failed", e);
      }
    }

    const initialTimer = window.setTimeout(() => {
      void loadMembersAndPresence();
    }, membersDeferMs);

const onVisible = () => {
  if (document.visibilityState === "visible") {
    void loadMembersAndPresence();
  }
};

document.addEventListener("visibilitychange", onVisible);

const timer = window.setInterval(loadMembersAndPresence, 20000);

return () => {
  cancelled = true;
  window.clearTimeout(initialTimer);
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisible);
};
  }, [classes, deviceId, fetchJoinedClasses, notificationsEnabled]);

  useEffect(() => {
    if (!classes.length || !deviceId) return;

    let cancelled = false;

    async function pollMessages() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }

  try {
        const results = await Promise.all(
          classes.map(async (c) => {
            const res = await fetch("/api/class/messages", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                classId: c.id,
                limit: 20,
              }),
              cache: "no-store",
            });

            const json = await readJsonSafe(res);

            return {
              classId: c.id,
              classTitle: formatClassLabel(c),
              messages: Array.isArray(json?.messages) ? json.messages : [],
            };
          })
        );

        if (cancelled) return;

        for (const row of results) {
          const messages = row.messages as ClassMessage[];
          if (!messages.length) continue;

          const latest = messages[messages.length - 1];
          const latestId = Number(latest?.id ?? 0);
          const prevId = Number(prevMessageIdsRef.current[row.classId] ?? 0);

          if (!prevId) {
            prevMessageIdsRef.current[row.classId] = latestId;
            continue;
          }

          if (latestId > prevId) {
            const newMessages = messages.filter((m) => Number(m.id) > prevId);

            for (const msg of newMessages) {
              const senderId = String(msg.device_id ?? "").trim();
              if (!senderId || senderId === deviceId) continue;

              const members = membersByClass[row.classId] ?? [];
              const senderMember = members.find((m) => m.device_id === senderId);
              const senderName = formatMemberDisplayName(senderMember ?? {});
              const sender =
                senderName === DISPLAY_NAME_FALLBACK ? "クラスメート" : senderName;

              const body =
                String(msg.message ?? "").trim() || "新しいメッセージがあります";

              pushBrowserNotification(
                notificationsEnabled,
                `新着メッセージ（${row.classTitle}）`,
                `${sender}: ${body}`
              );
            }

            prevMessageIdsRef.current[row.classId] = latestId;
          }
        }
      } catch (e) {
        console.error("[home] message polling failed", e);
      }
    }

    void pollMessages();

const onVisible = () => {
  if (document.visibilityState === "visible") {
    void pollMessages();
  }
};

document.addEventListener("visibilitychange", onVisible);

const timer = window.setInterval(pollMessages, 30000);

return () => {
  cancelled = true;
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisible);
};
  }, [classes, deviceId, membersByClass, notificationsEnabled]);

  const dismissInAppToast = useCallback((id: string) => {
    setInAppToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
  }, []);

  const pushInAppToast = useCallback(
    (item: InAppToastItem) => {
      if (seenNotificationIdsRef.current.has(item.id)) return;
      seenNotificationIdsRef.current.add(item.id);

      setInAppToasts((prev) => {
        if (prev.some((toast) => toast.id === item.id)) return prev;
        return [...prev, item].slice(-4);
      });

      const timer = window.setTimeout(() => {
        dismissInAppToast(item.id);
      }, 5000);
      toastTimersRef.current.set(item.id, timer);
    },
    [dismissInAppToast]
  );

  useEffect(() => {
    lastNotificationSinceRef.current = null;
    seenNotificationIdsRef.current.clear();
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId || classes.length === 0) return;

    let cancelled = false;

    async function pollNotificationFeed() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }

      const bootstrapIso = new Date().toISOString();
      if (!lastNotificationSinceRef.current) {
        lastNotificationSinceRef.current = bootstrapIso;
        return;
      }

      try {
        const res = await fetch(
          `/api/class/notifications/feed?device_id=${encodeURIComponent(
            deviceId
          )}&since=${encodeURIComponent(lastNotificationSinceRef.current)}`,
          { cache: "no-store" }
        );
        const json = await readJsonSafe(res);
        if (cancelled || !res.ok || !json?.ok) return;

        const events = Array.isArray(json.events) ? json.events : [];
        let hadNew = false;

        for (const event of events) {
          const id = String(event?.id ?? "").trim();
          const classId = String(event?.class_id ?? "").trim();
          if (!id || !classId) continue;

          pushInAppToast({
            id,
            classId,
            className: String(event?.class_name ?? "").trim() || "クラス",
            message:
              String(event?.toast_message ?? "").trim() ||
              "新しいお知らせがあります",
          });
          hadNew = true;
        }

        const cursor = String(json?.cursor ?? "").trim();
        if (cursor) {
          lastNotificationSinceRef.current = cursor;
        } else if (events.length === 0) {
          lastNotificationSinceRef.current = bootstrapIso;
        }

        if (hadNew) {
          void fetchJoinedClasses("notification_toast");
        }
      } catch (e) {
        console.error("[home] notification feed polling failed", e);
      }
    }

    void pollNotificationFeed();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pollNotificationFeed();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(pollNotificationFeed, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deviceId, classes.length, fetchJoinedClasses, pushInAppToast]);

  useEffect(() => {
    return () => {
      for (const timer of toastTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      toastTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pushOpenClassId = String(
      searchParams.get("pushOpenClassId") ?? ""
    ).trim();
    if (!pushOpenClassId || !classes.length || openingClassId) return;
    if (handledPushOpenClassIdRef.current === pushOpenClassId) return;

    const target = classes.find(
      (row) => String(row.id ?? "").trim() === pushOpenClassId
    );
    if (!target) return;

    handledPushOpenClassIdRef.current = pushOpenClassId;

    try {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("pushOpenClassId");
      const qs = params.toString();
      const basePath = pathname || window.location.pathname || "/";
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    } catch (e) {
      console.warn("[home] pushOpenClassId url cleanup failed", e);
    }

    void openClassRef.current(target);
  }, [searchParams, classes, openingClassId, pathname, router]);

  const visible = useMemo(() => {
    const byId = new Map<string, MineClass>();

    for (const c of classes) {
      const id = String(c.id ?? "").trim();
      if (!id) continue;
      if (leavingClassIdsRef.current.has(id)) continue;

      const prev = byId.get(id);
      const prevTime = prev?.created_at ? new Date(prev.created_at).getTime() : 0;
      const nextTime = c.created_at ? new Date(c.created_at).getTime() : 0;

      if (!prev || nextTime >= prevTime) {
        byId.set(id, c);
      }
    }

    const arr = Array.from(byId.values());
    arr.sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at;
    });
    return arr;
  }, [classes]);

  const welcomeName = String(profile?.display_name ?? "").trim() || "ゲスト";
  const profileComplete = isUserProfileComplete(profile);
  const hasJoinedClasses = visible.length > 0 || Boolean(currentClass);
  const primaryReturnClass = visible[0] ?? null;
  const openingPrimaryReturn =
    (!!primaryReturnClass && openingClassId === primaryReturnClass.id) ||
    (Boolean(currentClass) && openingClassId === currentClass?.classId);

  const showReturnCard =
    currentClassLoading || Boolean(currentClass) || Boolean(primaryReturnClass);

  function joinedClassEnterLabel(opening: boolean) {
    if (opening) return "入っています…";
    return "今のクラスを見る";
  }

  async function openReturnClass() {
    if (primaryReturnClass) {
      await openClass(primaryReturnClass);
      return;
    }

    if (!currentClass) return;

    const currentDeviceId = String(getDeviceId() ?? deviceId ?? "").trim();
    if (!currentDeviceId) {
      alert("device_id_missing");
      return;
    }

    setOpeningClassId(currentClass.classId);
    try {
      const result = await openJoinedClassRoom({
        deviceId: currentDeviceId,
        current: currentClass,
      });

      if (!result.ok) {
        alert(result.message ?? result.error);
        return;
      }

      router.push(buildRoomUrl(result.classId, result.sessionId, { openJoinedClass: true }));
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : "open_class_failed");
    } finally {
      setOpeningClassId(null);
    }
  }

  async function toggleNotifications() {
    if (typeof window === "undefined") return;

    if (!isWebPushSupported()) {
      alert(
        "このブラウザは Web Push に対応していません。Chrome / Edge / Firefox、または iOS 16.4+ でホーム画面に追加した Safari をお試しください。"
      );
      return;
    }

    if (notificationsEnabled) {
      const id = String(getDeviceId() ?? deviceId ?? "").trim();
      if (id) {
        await unsubscribeWebPush(id);
      }
      localStorage.setItem("notifications_enabled", "false");
      setNotificationsEnabled(false);
      return;
    }

    const id = String(getDeviceId() ?? deviceId ?? "").trim();
    if (!id) {
      alert("device_id_missing");
      return;
    }

    const result = await subscribeWebPush(id);
    if (!result.ok) {
      if (result.error === "permission_denied") {
        alert("通知が許可されていません。ブラウザ設定を確認してください。");
      } else if (result.error === "vapid_not_configured") {
        alert("Push通知は現在サーバー設定中です。しばらくしてからお試しください。");
      } else {
        alert("Push通知の有効化に失敗しました。");
      }
      return;
    }

    localStorage.setItem("notifications_enabled", "true");
    setNotificationsEnabled(true);
  }

  async function tryOpenClassWithHintSession(params: {
    target: MineClass;
    hintSessionId: string;
    currentDeviceId: string;
  }): Promise<boolean> {
    const classId = String(params.target.id ?? "").trim();
    const hintSessionId = String(params.hintSessionId ?? "").trim();
    if (!classId || !hintSessionId) return false;

    const hintStartMs = Date.now();
    try {
      const qs = new URLSearchParams({
        sessionId: hintSessionId,
        classId,
        lite: "1",
        fast: "1",
      });
      qs.set("viewerDeviceId", params.currentDeviceId);

      const res = await fetch(`/api/session/status?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await readJsonSafe(res);
      const hintSessionMs = Date.now() - hintStartMs;

      if (!res.ok || !json?.ok) {
        console.log(
          `[home openClass] hint-session-check-failed class=${classId.slice(-6)} ` +
            `session=${hintSessionId.slice(-6)} ms=${hintSessionMs}`
        );
        return false;
      }

      const members = Array.isArray(json.members) ? json.members : [];
      const selfIn =
        members.some(
          (member: ClassMember) =>
            String(member.device_id ?? "").trim() === params.currentDeviceId
        ) || json.viewerState?.inSessionMembers === true;

      if (!selfIn || members.length < 1) {
        console.log(
          `[home openClass] hint-session-not-member class=${classId.slice(-6)} ` +
            `session=${hintSessionId.slice(-6)} members=${members.length}`
        );
        return false;
      }

      const sessionStatus = String(json.session?.status ?? "")
        .trim()
        .toLowerCase();
      if (
        sessionStatus === "closed" ||
        sessionStatus === "ended" ||
        sessionStatus === "expired"
      ) {
        console.log(
          `[home openClass] hint-session-not-joinable class=${classId.slice(-6)} ` +
            `session=${hintSessionId.slice(-6)} status=${sessionStatus || "-"}`
        );
        return false;
      }

      if (isClassLeftLocally(classId)) {
        logHomeOpenClassBlocked(classId);
        return true;
      }

      clearClassLeftLocally(classId);
      storeHomeClassSessionHint(classId, hintSessionId, sessionStatus);
      console.log(
        `[home openClass] reuse-hint-session-direct session=${hintSessionId.slice(-6)} ` +
          `class=${classId.slice(-6)} members=${members.length} hintSessionMs=${hintSessionMs}`
      );

      const routeStartMs = Date.now();
      router.push(
        buildRoomUrl(classId, hintSessionId, { openJoinedClass: true })
      );
      logHomeOpenClassPerf({
        totalMs: Date.now() - hintStartMs,
        hintSessionMs,
        matchJoinMs: 0,
        routeMs: Date.now() - routeStartMs,
        path: "hint_reuse",
      });
      return true;
    } catch (e) {
      console.warn("[home openClass] hint-session-check error", e);
      return false;
    }
  }

  async function openClass(target: MineClass) {
    const openStartMs = Date.now();
    let hintSessionMs = 0;
    let matchJoinMs = 0;

    try {
      setOpeningClassId(target.id);

      if (isClassLeftLocally(target.id)) {
        logHomeOpenClassBlocked(target.id);
        return;
      }

      const currentDeviceId = String(getDeviceId() ?? "").trim();
      if (!currentDeviceId) {
        alert("device_id_missing");
        return;
      }

      let hintSessionId = String(target.session_id ?? "").trim();
      const fallbackHint = readHomeClassSessionHint(target.id);
      if (!hintSessionId && fallbackHint) {
        hintSessionId = fallbackHint;
        console.log(
          `[home openClass] fallback-hint-session class=${String(target.id).slice(-6)} ` +
            `session=${fallbackHint.slice(-6)}`
        );
      }

      if (hintSessionId) {
        const hintStartMs = Date.now();
        const openedViaHint = await tryOpenClassWithHintSession({
          target,
          hintSessionId,
          currentDeviceId,
        });
        hintSessionMs = Date.now() - hintStartMs;
        if (openedViaHint) {
          return;
        }
      }

      const matchJoinStartMs = Date.now();
      const openBody = buildMatchJoinRequestBody({
        deviceId: currentDeviceId,
        openJoinedClassId: target.id,
        sessionId: hintSessionId || null,
        topicKey: target.topic_key,
        worldKey: target.world_key ?? "default",
        capacity: 5,
      });

      console.log(
        `[home openClass] resolve-joinable-session class=${String(target.id).slice(-6)} ` +
          `hintSession=${hintSessionId.slice(-6) || "-"} fallback=match-join-v2`
      );

      console.log("[home openClass] match-join-v2 request body =", openBody);

      const res = await fetch("/api/class/match-join-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(openBody),
        cache: "no-store",
      });

      const json = await readJsonSafe(res);
      console.log("[home openClass] match-join response =", json);

      if (!res.ok || !json?.ok) {
        if (json?.error === "class_slots_limit") {
          alert(
            `クラス参加上限に達しています。現在のプランでは最大 ${
              json?.classSlots ?? "指定"
            } クラスまで参加できます。不要なクラスを抜けるか、プランを変更してください。`
          );
          return;
        }

        if (
          json?.error === "match_deadline_passed" ||
          json?.error === "recruitment_closed" ||
          json?.error === "session_closed"
        ) {
          alert(
            json?.message ??
              (json?.error === "match_deadline_passed"
                ? "このクラスへの参加受付は締め切られました"
                : json?.error === "session_closed"
                  ? "このセッションは終了しています"
                  : "このクラスは現在募集していません")
          );
          return;
        }

        if (json?.error === "admission_closed") {
          alert(
            json?.message ??
              "現在は入校受付時間外です。受付時間になったら、もう一度お試しください。"
          );
          return;
        }

        if (json?.error === "membership_left") {
          logHomeOpenClassBlocked(target.id);
          return;
        }

        alert(json?.error || "open_class_failed");
        return;
      }

      const row = Array.isArray(json?.data) ? json.data[0] : json;

const classId = String(
  json?.classId ??
    json?.class_id ??
    row?.classId ??
    row?.class_id ??
    ""
).trim();

const sessionId = String(
  json?.sessionId ??
    json?.session_id ??
    row?.sessionId ??
    row?.session_id ??
    ""
).trim();

console.log("[home] resolved ids", { classId, sessionId, json });

      if (!classId || !sessionId) {
        alert("open_class_missing_ids");
        return;
      }

      const resolvedStatus = String(
        json?.sessionStatus ?? json?.session_status ?? ""
      )
        .trim()
        .toLowerCase();
      if (
        resolvedStatus === "closed" ||
        resolvedStatus === "expired" ||
        resolvedStatus === "ended"
      ) {
        console.warn("[home openClass] reject non-joinable session", {
          classId: classId.slice(-6),
          sessionId: sessionId.slice(-6),
          sessionStatus: resolvedStatus,
        });
        alert("このセッションは終了しています。もう一度お試しください。");
        return;
      }

      const selectionReason = String(
        json?.selectionReason ?? json?.selection_reason ?? ""
      ).trim();
      if (hintSessionId && hintSessionId !== sessionId) {
        console.log(
          `[home openClass] discard-stale-session oldSession=${hintSessionId.slice(-6)} ` +
            `newSession=${sessionId.slice(-6)} reason=${selectionReason || "api_resolved"}`
        );
        if (
          selectionReason.includes("create_new") ||
          selectionReason.includes("no_valid_active")
        ) {
          console.warn(
            `[home openClass] hint-rejected-detail class=${classId.slice(-6)} ` +
              `hintSession=${hintSessionId.slice(-6)} resolvedSession=${sessionId.slice(-6)} ` +
              `reason=${selectionReason} status=${resolvedStatus || "-"} ` +
              `memberCount=${String(json?.memberCount ?? json?.member_count ?? "-")} ` +
              `(see server [class-session] reject-hint-session)`
          );
        }
        if (
          selectionReason.includes("stale") &&
          !selectionReason.includes("ignore_recruitment_ttl_stale") &&
          !selectionReason.includes("hint_joinable_empty")
        ) {
          console.warn(
            "[home openClass] unexpected session switch — stale-only reason without member reuse"
          );
        }
      } else if (hintSessionId && hintSessionId === sessionId) {
        console.log(
          `[home openClass] reuse-hint-session session=${sessionId.slice(-6)} ` +
            `reason=${selectionReason || "hint_reused"}`
        );
      }

      if (isClassLeftLocally(classId)) {
        logHomeOpenClassBlocked(classId);
        return;
      }

      clearClassLeftLocally(classId);
      storeHomeClassSessionHint(classId, sessionId, resolvedStatus);
      matchJoinMs = Date.now() - matchJoinStartMs;
      const routeStartMs = Date.now();
      router.push(buildRoomUrl(classId, sessionId, { openJoinedClass: true }));
      logHomeOpenClassPerf({
        totalMs: Date.now() - openStartMs,
        hintSessionMs,
        matchJoinMs,
        routeMs: Date.now() - routeStartMs,
        path: "match_join",
      });
    } catch (e: any) {
      console.error("[home openClass] error =", e);
      alert(e?.message || "open_class_failed");
    } finally {
      setOpeningClassId(null);
    }
  }
  openClassRef.current = openClass;

  async function quickJoinFreeAndOpen() {
    try {
      setQuickBusy(true);

      const currentDeviceId = String(getDeviceId() ?? "").trim();
      if (!currentDeviceId) {
        alert("device_id_missing");
        return;
      }

      const quickBody = buildMatchJoinRequestBody({
        deviceId: currentDeviceId,
        topicKey: null,
        worldKey: "default",
        capacity: 5,
      });

      console.log(
        `[match-join] click device=${currentDeviceId.slice(-6)} topic=free prefs=default`
      );

      const res = await fetch("/api/class/match-join-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(quickBody),
        cache: "no-store",
      });

      const json = await readJsonSafe(res);
      console.log(
        `[match-join] response class=${String(json?.classId ?? "").slice(-6)} ` +
          `session=${String(json?.sessionId ?? "").slice(-6)} ` +
          `createdNew=${Boolean(json?.createdNewClass)} joinedExisting=${Boolean(json?.reused) || Boolean(json?.raceMerged)} ` +
          `requestId=${String(json?.requestId ?? "").slice(0, 8)}`
      );

      if (!res.ok || !json?.ok) {
        if (json?.error === "class_slots_limit") {
          alert(
            `クラス参加上限に達しています。現在のプランでは最大 ${
              json?.classSlots ?? "指定"
            } クラスまで参加できます。不要なクラスを抜けるか、プランを変更してください。`
          );
          return;
        }

        if (
          json?.error === "admission_closed" ||
          json?.error === "match_deadline_passed" ||
          json?.error === "recruitment_closed"
        ) {
          if (json?.error === "admission_closed") {
            alert("現在入校受付時間外です。");
            return;
          }

          alert(
            json?.message ??
              (json?.error === "match_deadline_passed"
                ? "このクラスへの参加受付は締め切られました"
                : "このクラスは現在募集していません")
          );
          return;
        }

        alert(json?.error || "quick_join_failed");
        return;
      }

     const row = Array.isArray(json?.data) ? json.data[0] : json;

const classId = String(
  json?.classId ??
    json?.class_id ??
    row?.classId ??
    row?.class_id ??
    ""
).trim();

const sessionId = String(
  json?.sessionId ??
    json?.session_id ??
    row?.sessionId ??
    row?.session_id ??
    ""
).trim();

console.log("[home quick] resolved ids", { classId, sessionId, json });

      if (!classId || !sessionId) {
        alert("quick_join_missing_ids");
        return;
      }

      clearClassLeftLocally(classId);
      markAutoCallOnce(sessionId, currentDeviceId);
      router.push(buildRoomUrl(classId, sessionId));
    } catch (e: any) {
      console.error("[home quick free] error =", e);
      alert(e?.message || "quick_join_failed");
    } finally {
      setQuickBusy(false);
    }
  }

  function recordLeaveSuccess(classId: string) {
    fetchJoinedClassesGenRef.current += 1;
    leftSucceededClassIdsRef.current.add(classId);
    console.log(`[home-leave] suppress class=${classId.slice(-6)}`);
    removeClassFromHomeState(classId);
    console.log(`[home-leave] success class=${classId.slice(-6)}`);
  }

  function removeClassFromHomeState(classId: string) {
    markClassLeftLocally(classId);
    clearHomeClassSessionHint(classId);
    setClasses((prev) => prev.filter((c) => String(c.id ?? "").trim() !== classId));
    setMembersByClass((prev) => {
      const next = { ...prev };
      delete next[classId];
      return next;
    });
    setPresenceByClass((prev) => {
      const next = { ...prev };
      delete next[classId];
      return next;
    });
    prevMembersRef.current = { ...prevMembersRef.current };
    delete prevMembersRef.current[classId];
    prevPresenceRef.current = { ...prevPresenceRef.current };
    delete prevPresenceRef.current[classId];
    delete prevMemberStatusRef.current[classId];
  }

  async function leaveClass(
    target: MineClass,
    opts: { source: string }
  ) {
    const classId = String(target.id ?? "").trim();
    const title = formatClassLabel(target);

    if (!classId) return;

    if (opts.source !== CLASS_LEAVE_CONFIRMED_SOURCE) {
      console.log("[home-leave] blocked reason=missing_confirmed_source", {
        classId: classId.slice(-6),
        source: opts.source || "-",
      });
      return;
    }

    if (leavingClassIdsRef.current.has(classId)) {
      return;
    }

    if (!confirm(`「${title}」を抜けますか？`)) {
      return;
    }

    const currentDeviceId = String(getDeviceId() ?? deviceId ?? "").trim();
    if (!currentDeviceId) {
      alert("device_id_missing");
      return;
    }

    leavingClassIdsRef.current.add(classId);
    setLeavingClassId(classId);

    console.log("[home-leave] request", {
      classId,
      deviceId: currentDeviceId,
      source: CLASS_LEAVE_CONFIRMED_SOURCE,
    });

    try {
      const res = await fetch("/api/class/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: currentDeviceId,
          classId,
          source: CLASS_LEAVE_CONFIRMED_SOURCE,
        }),
        cache: "no-store",
      });

      const raw = await res.text().catch(() => "");
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = { error: raw || "invalid_json" };
      }

      const errorCode = String(json?.error ?? "").trim();
      const alreadyLeft = errorCode === "not_member";

      if (res.ok && json?.ok) {
        recordLeaveSuccess(classId);
        return;
      }

      if (alreadyLeft) {
        recordLeaveSuccess(classId);
        console.log("[home-leave] note=already-left", {
          classId: classId.slice(-6),
        });
        return;
      }

      if (errorCode === "missing_confirmed_source") {
        console.log("[home-leave] blocked reason=missing_confirmed_source");
        alert("クラス退出は確認ボタンからのみ実行できます。");
        return;
      }

      console.warn("[home-leave] failed", {
        classId,
        deviceId: currentDeviceId,
        status: res.status,
        error: errorCode || raw,
      });

      clearClassLeftLocally(classId);
      void fetchJoinedClasses("leave_rollback", { deviceId: currentDeviceId });
      alert(errorCode || `leave_failed (${res.status})`);
    } catch (e: any) {
      console.warn("[home-leave] failed", {
        classId,
        deviceId: currentDeviceId,
        error: e?.message ?? "unknown_error",
      });
      clearClassLeftLocally(classId);
      void fetchJoinedClasses("leave_rollback", { deviceId: currentDeviceId });
      alert(e?.message || "leave_failed");
    } finally {
      leavingClassIdsRef.current.delete(classId);
      setLeavingClassId(null);
    }
  }

  if (loading && !showReturnCard && classes.length === 0) {
    return <p style={{ margin: 0 }}>読み込み中...</p>;
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <style>{HOME_DASHBOARD_LAYOUT_CSS}</style>

      <div>
        <p style={{ margin: 0, fontSize: 15, color: "#374151" }}>
          ようこそ、<b>{welcomeName}</b> さん
        </p>
        {joinWindowText ? (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {joinWindowOpen ? (
              <StatusPill>
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: "#22c55e",
                    display: "inline-block",
                  }}
                />
                {joinWindowText}
              </StatusPill>
            ) : (
              <StatusPill>受付時間外</StatusPill>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div style={{ color: "#dc2626", fontWeight: 800, fontSize: 13 }}>{error}</div>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "1fr",
        }}
      >
        {showReturnCard ? (
          <ReturnClassCard
            className="home-dash-return"
            loading={currentClassLoading && !primaryReturnClass && !currentClass}
            opening={openingPrimaryReturn}
            onOpen={() => void openReturnClass()}
          />
        ) : null}

        <div className="home-dash-bottom">
          <JoinNewCard
            className="home-dash-join"
            quickJoinBusy={quickBusy}
            quickJoinDisabled={!joinWindowOpen}
            onQuickJoin={quickJoinFreeAndOpen}
            onPickPlace={() => router.push(withDev("/class/select"))}
          />

          <AgeFilterCard
            className="home-dash-age"
            deviceId={deviceId}
            hasProfile={profileComplete}
            disabled={loading}
          />
        </div>
      </div>

      {hasJoinedClasses ? (
        <section style={{ display: "grid", gap: 14 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 900,
              color: "#374151",
            }}
          >
            所属クラス
          </h3>
          <div style={{ display: "grid", gap: 14 }}>
            {visible.map((c) => {
              const leaving =
                leavingClassId === c.id || leavingClassIdsRef.current.has(c.id);
              const opening = openingClassId === c.id;
              const members = membersByClass[c.id] ?? [];
              const presenceMap = presenceByClass[c.id] ?? {};
              const prevStatuses = prevMemberStatusRef.current[c.id] ?? {};
              const lastInSessionAtMap =
                lastInSessionAtByClassRef.current[c.id] ?? {};
              const classLabel = formatClassLabel(c);
              const sessionId = String(c.session_id ?? "").trim() || null;
              const sessionMemberIds =
                sessionMemberIdsByClassRef.current[c.id] ?? new Set<string>();
              const participationLabel = deriveClassParticipationLabel(
                sessionId,
                members,
                presenceMap,
                prevStatuses,
                lastInSessionAtMap,
                sessionMemberIds
              );
              const classStatusLabel =
                participationLabel ?? c.status_label ?? "所属中";
              const classStatusPill = getClassStatusStyle(classStatusLabel);
              const { inCall, waiting } = summarizeMemberParticipation(
                members,
                presenceMap,
                sessionId,
                prevStatuses,
                lastInSessionAtMap,
                sessionMemberIds
              );
              const onlineSummary =
                inCall > 0
                  ? `${inCall}人が通話中`
                  : waiting > 0
                    ? `${waiting}人が待機中`
                    : "";
              const avatarPreview = members.slice(0, 5);

              return (
                <div
                  key={c.id}
                  style={{
                    textAlign: "left",
                    padding: "16px",
                    borderRadius: 16,
                    border: "1px solid #e5e7eb",
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          color: "#111",
                          fontSize: 26,
                          lineHeight: 1.2,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {classLabel}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: "#64748b",
                          fontWeight: 800,
                        }}
                      >
                        参加者 {members.length}人
                        {onlineSummary ? ` · ${onlineSummary}` : ""}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      {Number(c.unread_count ?? 0) > 0 ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: "#fee2e2",
                            color: "#b91c1c",
                            border: "1px solid #fecaca",
                            whiteSpace: "nowrap",
                          }}
                        >
                          未読 {Number(c.unread_count)}件
                        </span>
                      ) : null}
                      <span
                        style={{
                          ...classStatusPill,
                          fontSize: 12,
                          fontWeight: 900,
                          padding: "6px 10px",
                          borderRadius: 999,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {classStatusLabel}
                      </span>
                    </div>
                  </div>

                  {avatarPreview.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      {avatarPreview.map((m) => (
                        <img
                          key={`${c.id}-avatar-${m.device_id}`}
                          src={getMemberAvatarUrl(m.photo_path)}
                          alt={formatMemberDisplayName(m)}
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = "/default-avatar.jpg";
                          }}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "2px solid #fff",
                            boxShadow: "0 0 0 1px #e2e8f0",
                          }}
                        />
                      ))}
                      {members.length > avatarPreview.length ? (
                        <span
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            fontWeight: 800,
                          }}
                        >
                          +{members.length - avatarPreview.length}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {c.description ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        fontWeight: 700,
                        marginTop: 10,
                      }}
                    >
                      {c.description}
                    </div>
                  ) : null}

                  <MeetingPlanSection
                    classId={c.id}
                    deviceId={deviceId}
                    plan={c.next_meeting_plan ?? null}
                    onUpdated={(plan) => {
                      setClasses((prev) =>
                        prev.map((row) =>
                          row.id === c.id ? { ...row, next_meeting_plan: plan } : row
                        )
                      );
                    }}
                  />

                  <CallRequestSection
                    classId={c.id}
                    deviceId={deviceId}
                    request={c.active_call_request ?? null}
                    entering={opening}
                    onEnter={() => void openClass(c)}
                    onUpdated={(request) => {
                      setClasses((prev) =>
                        prev.map((row) =>
                          row.id === c.id
                            ? { ...row, active_call_request: request }
                            : row
                        )
                      );
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => void openClass(c)}
                    disabled={opening}
                    style={{
                      ...PRIMARY_BTN,
                      marginTop: 14,
                      opacity: opening ? 0.75 : 1,
                      cursor: opening ? "default" : "pointer",
                    }}
                  >
                    {joinedClassEnterLabel(opening)}
                  </button>

                  <details style={{ marginTop: 12 }}>
                    <summary
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: "#475569",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      クラスメートを見る（{members.length}人）
                    </summary>

                    {members.length === 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginTop: 8,
                        }}
                      >
                        まだ表示できるクラスメートがいません
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                        {members.map((m) => {
                          const isMe = m.device_id === deviceId;
                          const memberDeviceId = String(m.device_id ?? "").trim();
                          const inSession =
                            sessionMemberIds.has(memberDeviceId);
                          const memberDisplay = resolveParticipationDisplay({
                            source: mergeMemberPresenceSource(
                              m,
                              presenceMap[m.device_id]
                            ),
                            currentSessionId: sessionId,
                            freshMs: PRESENCE_FRESH_MS_HOME,
                            previous: prevStatuses[m.device_id] ?? null,
                            previousInternal:
                              prevMemberInternalRef.current[c.id]?.[
                                m.device_id
                              ] ?? null,
                            context: "home",
                            deviceId: memberDeviceId,
                            inSessionMembers: inSession,
                            inClassMembership: true,
                            lastInSessionAt: inSession
                              ? lastInSessionAtMap[m.device_id]
                              : undefined,
                            isMe,
                          });
                          const participation = memberDisplay.participation;
                          const pill = participationStatusStyle(participation);

                          return (
                            <div
                              key={`${c.id}-${m.device_id}`}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "#fafafa",
                                border: "1px solid #eee",
                              }}
                            >
                              <button
                                type="button"
                                disabled={!memberDeviceId || !deviceId}
                                onClick={() => {
                                  if (!memberDeviceId || !deviceId) return;
                                  setProfileTarget({
                                    deviceId: memberDeviceId,
                                    viewerDeviceId: deviceId,
                                    classId: c.id,
                                    sessionId:
                                      String(c.session_id ?? "").trim() || undefined,
                                    displayName: m.display_name,
                                    photoPath: m.photo_path ?? null,
                                  });
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  border: "none",
                                  background: "transparent",
                                  padding: 0,
                                  margin: 0,
                                  cursor: "pointer",
                                  fontSize: 13,
                                  fontWeight: 800,
                                  color: "#111",
                                  textAlign: "left",
                                  minWidth: 0,
                                  flex: 1,
                                }}
                              >
                                <img
                                  src={getMemberAvatarUrl(m.photo_path)}
                                  alt={formatMemberDisplayName(m)}
                                  onError={(event) => {
                                    event.currentTarget.onerror = null;
                                    event.currentTarget.src = "/default-avatar.jpg";
                                  }}
                                  style={{
                                    width: LIST_MEMBER_AVATAR_PX,
                                    height: LIST_MEMBER_AVATAR_PX,
                                    borderRadius: "50%",
                                    objectFit: "cover",
                                    border: "1px solid #e5e7eb",
                                    flexShrink: 0,
                                  }}
                                />
                                <span>
                                  {formatMemberDisplayName(m)}
                                  {isMe ? "（あなた）" : ""}
                                </span>
                              </button>

                              <span
                                style={{
                                  ...pill,
                                  fontSize: 11,
                                  fontWeight: 900,
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {memberDisplay.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </details>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void leaveClass(c, {
                        source: CLASS_LEAVE_CONFIRMED_SOURCE,
                      });
                    }}
                    disabled={leaving}
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fff",
                      color: "#b91c1c",
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: leaving ? "default" : "pointer",
                      opacity: leaving ? 0.7 : 1,
                    }}
                  >
                    {leaving ? "抜けています…" : "クラスから抜ける"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section
        style={{
          ...DASH_CARD,
          padding: "14px 16px",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => void toggleNotifications()}
          style={{
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: notificationsEnabled ? "#f0fdf4" : "#fff",
            color: "#4b5563",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {notificationsEnabled ? "Push通知 OFF" : "Push通知"}
        </button>

        <button
          type="button"
          onClick={() => router.push(withDev(buildProfileEditPath("/")))}
          style={{
            padding: "8px 12px",
            borderRadius: 12,
            border: profileComplete ? "1px solid #e5e7eb" : "1px solid #111827",
            background: profileComplete ? "#fff" : "#111827",
            color: profileComplete ? "#4b5563" : "#fff",
            fontWeight: profileComplete ? 800 : 900,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {profileComplete ? "プロフィール編集" : "プロフィール登録"}
        </button>
      </section>

      {mounted ? <DevPanel deviceId={deviceId} /> : null}

      <InAppToastStack
        toasts={inAppToasts}
        onDismiss={dismissInAppToast}
        onOpen={(toast) => {
          dismissInAppToast(toast.id);
          const target = classes.find(
            (row) =>
              String(row.id ?? "").trim() === String(toast.classId).trim()
          );
          if (target) void openClass(target);
        }}
      />

      <MemberProfileModal
        target={profileTarget}
        onClose={() => setProfileTarget(null)}
      />
    </div>
  );
}