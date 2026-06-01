"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { DevPanel } from "@/components/DevPanel";
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
import { isUserProfileComplete } from "@/lib/profileClient";

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
};

type PresenceStatus = "offline" | "waiting" | "active";

type PresenceRow = {
  device_id: string;
  status: PresenceStatus;
  session_id?: string | null;
  updated_at?: string | null;
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

function mapPresenceRow(
  raw: Record<string, unknown>,
  currentSessionId?: string
): PresenceRow | null {
  const deviceId = String(raw.device_id ?? "").trim();
  if (!deviceId) return null;

  const rowSessionId = String(raw.session_id ?? "").trim();
  if (
    currentSessionId &&
    rowSessionId &&
    rowSessionId !== currentSessionId
  ) {
    return {
      device_id: deviceId,
      status: "offline",
      session_id: rowSessionId,
      updated_at: String(raw.last_seen_at ?? "").trim() || null,
    };
  }

  const effective = String(
    raw.effective_status ?? raw.status ?? "offline"
  ).trim().toLowerCase();

  let status: PresenceStatus = "offline";
  if (effective === "calling" || effective === "active" || effective === "call") {
    status = "active";
  } else if (effective === "waiting" || effective === "room") {
    status = "waiting";
  }

  return {
    device_id: deviceId,
    status,
    session_id: rowSessionId || null,
    updated_at: String(raw.last_seen_at ?? "").trim() || null,
  };
}

function getEffectiveStatus(p?: PresenceRow): PresenceStatus {
  if (!p?.updated_at) return "offline";

  const t = new Date(p.updated_at).getTime();
  if (!Number.isFinite(t)) return "offline";

  const diff = Date.now() - t;

  if (diff > 45000) return "offline";

  if (p.status === "active") return "active";
  if (p.status === "waiting") return "waiting";
  return "offline";
}

function statusLabel(status: PresenceStatus) {
  if (status === "active") return "通話中";
  if (status === "waiting") return "オンライン";
  return "オフライン";
}

function statusStyle(status: PresenceStatus) {
  if (status === "active") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }

  if (status === "waiting") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fcd34d",
    };
  }

  return {
    background: "#f3f4f6",
    color: "#6b7280",
    border: "1px solid #d1d5db",
  };
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
  const prevMessageIdsRef = useRef<Record<string, number>>({});
  const inviteRetryTimerRef = useRef<number | null>(null);
  const lastNotificationSinceRef = useRef<string | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const toastTimersRef = useRef<Map<string, number>>(new Map());
  const openClassRef = useRef<(target: MineClass) => Promise<void>>(async () => {});
  const handledPushOpenClassIdRef = useRef<string | null>(null);

  const [mounted, setMounted] = useState(false);
  const [inAppToasts, setInAppToasts] = useState<InAppToastItem[]>([]);

  const fetchJoinedClasses = useCallback(
    async (
      reason: string,
      opts?: {
        deviceId?: string;
        throwOnError?: boolean;
        expectedClassId?: string | null;
      }
    ) => {
      console.log("[home] fetchJoinedClasses start", { reason });

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
        const classesRes = await fetch(
          `/api/class/mine?deviceId=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );
        const classesJson = await readJsonSafe(classesRes);

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

        const nextClasses = Array.isArray(classesJson.classes)
          ? classesJson.classes
          : [];
        const classIds = nextClasses.map((c: MineClass) =>
          String(c.id ?? "").trim()
        );

        if (classesJson.recruitment_session_ttl_unlimited === true) {
          setRecruitmentSessionTtlUnlimited(true);
          setRecruitmentSessionTtlMinutes(null);
        } else if (Number(classesJson.recruitment_session_ttl_minutes) > 0) {
          setRecruitmentSessionTtlUnlimited(false);
          setRecruitmentSessionTtlMinutes(
            Number(classesJson.recruitment_session_ttl_minutes)
          );
        }

        console.log("[home] fetchJoinedClasses success", {
          reason,
          count: nextClasses.length,
          classIds,
        });

        setClasses((prev) => {
          const forceApply =
            reason === "invite_success" ||
            reason === "focus" ||
            reason === "visibility" ||
            reason === "manual";

          if (!forceApply && prev.length > 0 && nextClasses.length === 0) {
            console.warn("[home] ignore empty classes snapshot once");
            return prev;
          }

          return nextClasses;
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

        const profileRes = await fetch(
          `/api/profile?device_id=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );

        if (cancelled) return;

        if (profileRes.ok) {
          const profileJson = await readJsonSafe(profileRes);
          const nextProfile =
            profileJson?.profile && typeof profileJson.profile === "object"
              ? profileJson.profile
              : profileJson?.device_id
                ? profileJson
                : null;

          setProfile(nextProfile);
        } else {
          setProfile(null);
        }

        const refreshFromQuery =
          (searchParams.get("refreshClasses") ?? "").trim() === "1";
        const refreshFromStorage = consumeJoinedClassesRefresh();
        const fetchReason =
          refreshFromQuery || refreshFromStorage.pending
            ? "invite_success"
            : "mount";

        await fetchJoinedClasses(fetchReason, {
          deviceId: id,
          throwOnError: true,
          expectedClassId: refreshFromStorage.classId,
        });
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
  }, [fetchJoinedClasses]);

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

async function loadMembersAndPresence() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }

  const classIds = classes.map((c) => c.id).filter(Boolean);
  try {
    
    const results = await Promise.all(
  classIds.map(async (classId) => {
    try {
      let members: ClassMember[] = [];
      let presence: PresenceRow[] = [];
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
  console.warn("[home] members load failed", classId, e);
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
  for (const raw of presenceItems) {
    const mapped = mapPresenceRow(raw as Record<string, unknown>, sessionId);
    if (mapped) presenceMap[mapped.device_id] = mapped;
  }
  presence = Object.values(presenceMap);
} catch (e) {
  console.warn("[home] presence load failed", classId, e);
}

return {
  classId,
  members,
  presence,
};
    } catch (e) {
      console.warn("[home] partial members/presence load failed", classId, e);

      return {
        classId,
        members: [],
        presence: [],
      };
    }
  })
);

        if (cancelled) return;

        const nextMembersByClass: Record<string, ClassMember[]> = {};
        const nextPresenceByClass: Record<string, Record<string, PresenceRow>> = {};

        for (const row of results) {
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
        }

        const prev = prevPresenceRef.current;

        for (const c of classes) {
          const classId = c.id;
          const classTitle = formatClassLabel(c);
          const currentPresenceMap = nextPresenceByClass[classId] ?? {};
          const prevPresenceMap = prev[classId] ?? {};
          const members = nextMembersByClass[classId] ?? [];

          for (const member of members) {
            const memberId = String(member.device_id ?? "").trim();
            if (!memberId || memberId === deviceId) continue;

            const prevStatus = getEffectiveStatus(prevPresenceMap[memberId]);
            const nextStatus = getEffectiveStatus(currentPresenceMap[memberId]);

            if (prevStatus !== "active" && nextStatus === "active") {
              pushBrowserNotification(
                notificationsEnabled,
                "通話が始まりました",
                `${formatMemberDisplayName(member)}さんが「${classTitle}」で通話中です`
              );
            }

            if (
              prevStatus === "offline" &&
              (nextStatus === "waiting" || nextStatus === "active")
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
        setMembersByClass(nextMembersByClass);
        setPresenceByClass(nextPresenceByClass);
      } catch (e) {
        console.error("[home] members/presence load failed", e);
      }
    }

    void loadMembersAndPresence();

const onVisible = () => {
  if (document.visibilityState === "visible") {
    void loadMembersAndPresence();
  }
};

document.addEventListener("visibilitychange", onVisible);

const timer = window.setInterval(loadMembersAndPresence, 20000);

return () => {
  cancelled = true;
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisible);
};
  }, [classes, deviceId, notificationsEnabled]);

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

  async function openClass(target: MineClass) {
    try {
      setOpeningClassId(target.id);

      const currentDeviceId = String(getDeviceId() ?? "").trim();
      if (!currentDeviceId) {
        alert("device_id_missing");
        return;
      }

      const openBody = buildMatchJoinRequestBody({
        deviceId: currentDeviceId,
        openJoinedClassId: target.id,
        topicKey: target.topic_key,
        worldKey: target.world_key ?? "default",
        capacity: 5,
      });

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
          json?.error === "recruitment_closed"
        ) {
          alert(
            json?.message ??
              (json?.error === "match_deadline_passed"
                ? "このマッチングは締め切られました"
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

      router.push(buildRoomUrl(classId, sessionId, { openJoinedClass: true }));
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

      console.log("[home quick free] match-join-v2 request body =", quickBody);

      const res = await fetch("/api/class/match-join-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(quickBody),
        cache: "no-store",
      });

      const json = await readJsonSafe(res);
      console.log("[home quick free] response =", json);

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
                ? "このマッチングは締め切られました"
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

      router.push(buildRoomUrl(classId, sessionId));
    } catch (e: any) {
      console.error("[home quick free] error =", e);
      alert(e?.message || "quick_join_failed");
    } finally {
      setQuickBusy(false);
    }
  }

  async function leaveClass(target: MineClass) {
    const title = formatClassLabel(target);

    if (!confirm(`「${title}」を抜けますか？`)) {
      return;
    }

    try {
      setLeavingClassId(target.id);

      const currentDeviceId = String(getDeviceId() ?? "").trim();
      if (!currentDeviceId) {
        alert("device_id_missing");
        return;
      }

      const res = await fetch("/api/class/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: currentDeviceId,
          classId: target.id,
        }),
        cache: "no-store",
      });

      const raw = await res.text().catch(() => "");
      let json: any = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = { raw };
      }

      console.log("[home leave] status =", res.status);
      console.log("[home leave] json =", json);

      if (!res.ok || !json?.ok) {
        alert(json?.error || `leave_failed (${res.status})`);
        return;
      }

      setClasses((prev) => prev.filter((c) => String(c.id) !== String(target.id)));
      setMembersByClass((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
      setPresenceByClass((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
    } catch (e: any) {
      console.error("[home leave] error =", e);
      alert(e?.message || "leave_failed");
    } finally {
      setLeavingClassId(null);
    }
  }

  if (loading) {
    return <p style={{ margin: 0 }}>読み込み中...</p>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0 }}>
        ようこそ、<b>{welcomeName}</b> さん
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => router.push(withDev("/class/select"))}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          はじめる（入る場所を選ぶ）
        </button>

        <button
          onClick={quickJoinFreeAndOpen}
          disabled={quickBusy}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            fontWeight: 900,
            cursor: quickBusy ? "default" : "pointer",
            opacity: quickBusy ? 0.7 : 1,
          }}
        >
          {quickBusy ? "参加中…" : "今すぐ入る"}
        </button>

        <button
          onClick={() => void toggleNotifications()}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: notificationsEnabled ? "#dcfce7" : "#fff",
            color: "#111",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {notificationsEnabled ? "Push通知OFF" : "Push通知を有効化"}
        </button>

        <button
          onClick={() => router.push(withDev("/profile"))}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {profileComplete ? "プロフィール編集" : "プロフィール登録"}
        </button>
      </div>

      {joinWindowText ? (
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
          {joinWindowOpen ? joinWindowText : `${joinWindowText}（時間外）`}
        </div>
      ) : null}

      <div style={{ marginTop: 6, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>自分のクラス</div>

        {error ? (
          <div style={{ color: "#dc2626", fontWeight: 800, fontSize: 13 }}>
            {error}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ color: "#6b7280", fontWeight: 800, fontSize: 13 }}>
            まだありません。
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visible.map((c) => {
              const leaving = leavingClassId === c.id;
              const opening = openingClassId === c.id;
              const members = membersByClass[c.id] ?? [];
              const presenceMap = presenceByClass[c.id] ?? {};
              const classLabel = formatClassLabel(c);
              const classStatusLabel =
                c.status_label ??
                getClassStatusLabel({
                  sessionStatus: c.session_status,
                  matchDeadlineAt: c.match_deadline_at,
                  hasActiveSession: c.has_active_session,
                  sessionCreatedAt: c.session_created_at,
                  recruitmentSessionTtlMinutes,
                });
              const classStatusPill = getClassStatusStyle(classStatusLabel);

              return (
                <div
                  key={`${c.id}`}
                  style={{
                    textAlign: "left",
                    padding: "14px 14px",
                    borderRadius: 14,
                    border: "1px solid #ddd",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          color: "#111",
                          fontSize: 24,
                          lineHeight: 1.2,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {classLabel}
                      </div>

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
                    </div>

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

                  {c.description ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        fontWeight: 700,
                        marginTop: 8,
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
                          row.id === c.id
                            ? { ...row, next_meeting_plan: plan }
                            : row
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

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#111" }}>
                      クラスメート
                    </div>

                    {members.length === 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginTop: 6,
                        }}
                      >
                        まだ表示できるクラスメートがいません
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                        {members.map((m) => {
                          const isMe = m.device_id === deviceId;
                          const memberDeviceId = normalizeMemberDeviceId(
                            m.device_id
                          );
                          const rawPresence = presenceMap[m.device_id];
                          const presence = getEffectiveStatus(rawPresence);
                          const pill = statusStyle(presence);

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
                                    sessionId: String(c.session_id ?? "").trim() || undefined,
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
                                {statusLabel(presence)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 12,
                    }}
                  >
                    <button
                      onClick={() => void openClass(c)}
                      disabled={opening}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#111",
                        color: "#fff",
                        fontWeight: 900,
                        cursor: opening ? "default" : "pointer",
                        opacity: opening ? 0.7 : 1,
                      }}
                    >
                      {opening ? "開いています…" : "開く"}
                    </button>

                    <button
                      onClick={() => void leaveClass(c)}
                      disabled={leaving}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #fca5a5",
                        background: "#fff",
                        color: "#b91c1c",
                        fontWeight: 900,
                        cursor: leaving ? "default" : "pointer",
                        opacity: leaving ? 0.7 : 1,
                      }}
                    >
                      {leaving ? "抜けています…" : "抜ける"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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