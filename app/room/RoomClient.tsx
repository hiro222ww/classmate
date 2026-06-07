"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { ChalkboardRoomShell } from "./ChalkboardRoomShell";
import { supabase } from "@/lib/supabaseClient";
import { getDeviceId } from "@/lib/device";
import { pushRecentClass } from "@/lib/recentClasses";
import { markJoinedClassesStale } from "@/lib/joinedClassesRefresh";
import { clearLocallyHiddenClass } from "@/lib/localHiddenClasses";
import { isDevMode, getDevUserKey } from "@/lib/devMode";
import { withDev } from "@/lib/withDev";
import {
  buildCurrentPathReturnTo,
  buildProfileEditPath,
} from "@/lib/profileNavigation";
import { buildMatchJoinRequestBody } from "@/lib/matchJoinRequest";
import {
  formatMemberDisplayName,
  logMemberDisplayNamesFromApi,
  pickLatestSessionMemberByDevice,
  resolveDisplayName,
} from "@/lib/resolveDisplayName";
import SessionMessages from "@/components/SessionMessages";
import MemberModerationButtons from "@/components/MemberModerationButtons";
import MemberProfileModal from "@/components/MemberProfileModal";
import {
  LIST_MEMBER_AVATAR_PX,
  normalizeMemberDeviceId,
  type MemberProfileTarget,
} from "@/lib/memberProfileView";
import MeetingPlanSection from "@/components/MeetingPlanSection";
import CallRequestSection from "@/components/CallRequestSection";
import { HelpTip } from "@/components/HelpTip";
import { fetchWithRetry } from "@/lib/retryableFetch";
import {
  compactMemberDeviceIds,
  diffMemberDeviceIds,
  evaluateMemberListApply,
  getInviteGraceRemainingMs,
  logRoomMembersBeforeUpdate,
  logRoomMembersEmptyIgnored,
  logRoomMembersRemoved,
  MEMBER_LIST_EMPTY_STREAK_REQUIRED,
  INVITE_JOIN_GRACE_MS,
} from "@/lib/memberListGuard";
import { logDeviceIdInit, logDeviceIdStability } from "@/lib/deviceDiagnostics";
import {
  isInviteJoinGraceActive,
  logInviteJoinClient,
  logInviteRoute,
  logRoomMembersInviteGraceIgnored,
  readInviteRouteState,
  storeInviteRouteState,
} from "@/lib/inviteDiagnostics";
import type { MeetingPlanPublic } from "@/lib/meetingPlanClient";
import type { CallRequestPublic } from "@/lib/callRequest";
import {
  hasLocalLeftCall,
  sanitizeLocalLeftCallAfterReload,
} from "@/lib/localCallExit";
import {
  AUTO_CALL_MEMBERS_STABLE_MS,
  AUTO_CALL_STABLE_DELAY_MS,
  RECENT_REMATCH_CALL_BLOCK_MS,
  consumeAutoCallOnce,
  hasAutoCallOnce,
  markAutoCallOnce,
  transferAutoCallOnce,
} from "@/lib/autoCallOnce";
import {
  getCurrentPath,
  getNavigationType,
  logNavigationIntent,
  logRouteChange,
} from "@/lib/callLifecycle";
import {
  logParticipationStatusDecision,
  mapPresenceApiRow,
  participationStatusLabel,
  participationStatusStyle,
  PRESENCE_FRESH_MS_ROOM,
  resolveParticipationDisplay,
  type ParticipationSource,
  type UiParticipationStatus,
} from "@/lib/memberPresenceStatus";
import {
  isClassLeftLocally,
  logRoomAsyncIgnored,
  logRoomRematchBlocked,
} from "@/lib/leftClassMembership";

type MemberRow = {
  device_id?: string;
  display_name?: string;
  display_name_source?: string | null;
  photo_path?: string | null;
  avatar_url?: string | null;
  joined_at?: string;
  is_in_call?: boolean;
  screen?: string | null;
  last_seen_at?: string | null;
  presence_session_id?: string | null;
};

type PresenceRow = ParticipationSource & {
  device_id: string;
};


type ProfileResponse = {
  ok?: boolean;
  profile?: {
    device_id?: string | null;
    display_name?: string | null;
    birth_date?: string | null;
    gender?: string | null;
    photo_path?: string | null;
  } | null;
  error?: string;
  message?: string;
};

type SessionJoinResponse = {
  ok?: boolean;
  sessionId?: string;
  classId?: string | null;
  topic?: string;
  status?: string;
  capacity?: number;
  memberCount?: number;
  alreadyInSession?: boolean;
  error?: string;
};

type SessionStatusResponse = {
  ok?: boolean;
  session?: {
    id: string;
    class_id?: string;
    topic: string;
    status: "forming" | "active" | "closed";
    capacity: number;
    created_at: string | null;
  };
  members?: MemberRow[];
  memberCount?: number;
  viewerState?: {
    hasClassMembership: boolean;
    inSessionMembers: boolean;
    inMemberList: boolean;
  };
  error?: string;
};

type MineClassRow = {
  class_id?: string;
  id?: string;
  name?: string;
  world_key?: string | null;
  topic_key?: string | null;
  topic_title?: string | null;
  description?: string;
};

function normalizeName(v: string | null | undefined) {
  return String(v ?? "").trim();
}


function normalizeMemberCompare(list: MemberRow[]) {
  return list.map((m) => ({
    device_id: String(m.device_id ?? "").trim(),
    display_name: String(m.display_name ?? "").trim(),
    photo_path: String(m.photo_path ?? "").trim(),
    avatar_url: String(m.avatar_url ?? "").trim(),
    joined_at: String(m.joined_at ?? "").trim(),
    is_in_call: m.is_in_call === true,
    screen: String(m.screen ?? "").trim(),
    last_seen_at: String(m.last_seen_at ?? "").trim(),
  }));
}

function getDisplayNameStorageKeys(deviceId: string) {
  const normalized = String(deviceId ?? "").trim();

  if (!normalized) {
    return {
      scoped: "classmate_display_name",
      legacy: "display_name",
    };
  }

  return {
    scoped: `classmate_display_name:${normalized}`,
    legacy: `display_name:${normalized}`,
  };
}

function readStoredDisplayName(deviceId: string) {
  if (typeof window === "undefined") return "";

  const { scoped, legacy } = getDisplayNameStorageKeys(deviceId);

  return (
    localStorage.getItem(scoped) ||
    localStorage.getItem(legacy) ||
    ""
  ).trim();
}

function writeStoredDisplayName(deviceId: string, name: string) {
  if (typeof window === "undefined") return;

  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) return;

  const { scoped, legacy } = getDisplayNameStorageKeys(deviceId);

  localStorage.setItem(scoped, normalizedName);
  localStorage.setItem(legacy, normalizedName);
}

function formatTopicTitleFromClassRow(c: MineClassRow | null | undefined) {
  const direct = String(c?.topic_title ?? "").trim();
  if (direct) return direct;

  const topicKey = String(c?.topic_key ?? "").trim();
  if (!topicKey) return "フリー";

  if (topicKey === "free") return "フリー";
  if (topicKey === "woman") return "女子校";
  if (topicKey === "man") return "男子校";

  return topicKey;
}

function formatClassLabelFromClassRow(c: MineClassRow | null | undefined) {
  const raw = String(c?.name ?? "").trim();
  if (raw) return raw;

  const topicKey = String(c?.topic_key ?? "").trim();
  if (!topicKey) return "フリークラス";

  if (topicKey === "free") return "フリークラス";
  if (topicKey === "woman") return "女子校";
  if (topicKey === "man") return "男子校";

  return `${topicKey}クラス`;
}

async function readJsonSafe(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function resolveClassMatchKeys(deviceId: string, classId: string) {
  let worldKey = "default";
  let topicKey: string | null = null;

  if (!deviceId || !classId) {
    return { worldKey, topicKey };
  }

  try {
    const mineRes = await fetch(
      `/api/class/mine?deviceId=${encodeURIComponent(deviceId)}`,
      { cache: "no-store" }
    );
    const mineJson = await readJsonSafe(mineRes);
    const row = Array.isArray(mineJson?.classes)
      ? mineJson.classes.find(
          (c: MineClassRow) =>
            String(c.id ?? c.class_id ?? "").trim() === classId
        )
      : null;

    if (row) {
      worldKey = String(row.world_key ?? "default").trim() || "default";
      const rawTopic = row.topic_key;
      topicKey =
        rawTopic === null || rawTopic === undefined
          ? null
          : String(rawTopic).trim() || null;
    }
  } catch (e) {
    console.warn("[room rematch] class/mine lookup failed", e);
  }

  return { worldKey, topicKey };
}

async function rematchRoomSession(params: {
  deviceId: string;
  classId: string;
  openJoinedClassId?: string | null;
  shouldAbort?: () => boolean;
}) {
  const classId = String(params.classId ?? "").trim();
  if (!classId || isClassLeftLocally(classId)) {
    logRoomRematchBlocked(classId || params.classId);
    return {
      rematchRes: null,
      rematchJson: { ok: false, error: "class_left" } as Record<string, unknown>,
      blocked: true as const,
    };
  }
  if (params.shouldAbort?.()) {
    logRoomAsyncIgnored(classId, "op_stale", "rematch");
    return {
      rematchRes: null,
      rematchJson: { ok: false, error: "aborted" } as Record<string, unknown>,
      blocked: true as const,
    };
  }

  const { worldKey, topicKey } = await resolveClassMatchKeys(
    params.deviceId,
    params.classId
  );

  const rematchBody = buildMatchJoinRequestBody({
    deviceId: params.deviceId,
    worldKey,
    topicKey,
    capacity: 5,
    openJoinedClassId: params.openJoinedClassId ?? null,
  });

  console.log("[room] rematch match-join-v2 request body =", rematchBody);

  const rematchRes = await fetch("/api/class/match-join-v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rematchBody),
    cache: "no-store",
  });

  const rematchJson = await readJsonSafe(rematchRes);

  console.log("[room] rematch match-join-v2 response =", {
    ok: rematchJson?.ok,
    sessionId: rematchJson?.sessionId ?? rematchJson?.session_id,
    sessionStatus: rematchJson?.sessionStatus ?? rematchJson?.session_status,
    error: rematchJson?.error,
  });

  const nextClassId = String(
    rematchJson?.classId ?? rematchJson?.class_id ?? classId
  ).trim();
  if (
    params.shouldAbort?.() ||
    isClassLeftLocally(classId) ||
    (nextClassId && isClassLeftLocally(nextClassId))
  ) {
    if (
      isClassLeftLocally(classId) ||
      (nextClassId && isClassLeftLocally(nextClassId))
    ) {
      logRoomRematchBlocked(nextClassId || classId);
    } else {
      logRoomAsyncIgnored(classId, "op_stale", "rematch_response");
    }
    return {
      rematchRes,
      rematchJson: { ...(rematchJson ?? {}), ok: false, error: "class_left" },
      blocked: true as const,
    };
  }

  return { rematchRes, rematchJson, blocked: false as const };
}

function mergeRoomMemberPresenceSource(
  member: MemberRow,
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

function resolveRoomMemberDisplay(
  member: MemberRow,
  presence: PresenceRow | undefined,
  sessionId: string,
  previous: UiParticipationStatus | null,
  isMe: boolean,
  viewerDeviceId: string,
  lastInSessionAt?: number | null,
  previousInternal?: import("@/lib/memberStatus").InternalMemberStatus | null,
  inSessionMembers = false
) {
  const did = String(member.device_id ?? "").trim();
  const viewerId = String(viewerDeviceId ?? "").trim();
  const viewerLeftCall =
    !!viewerId && !!sessionId && hasLocalLeftCall(sessionId, viewerId);
  const localExitedCall =
    hasLocalLeftCall(sessionId, did) || (isMe && viewerLeftCall);

  if (localExitedCall) {
    return {
      status: "waiting" as const,
      label: "待機中",
      internal: "in_room" as const,
      used: "local_exited_call",
      reason: "localExitedCall",
    };
  }

  const display = resolveParticipationDisplay({
    source: mergeRoomMemberPresenceSource(member, presence),
    currentSessionId: sessionId,
    freshMs: PRESENCE_FRESH_MS_ROOM,
    previous,
    previousInternal: previousInternal ?? null,
    localExitedCall,
    context: "room",
    deviceId: did,
    inSessionMembers,
    inClassMembership: false,
    lastInSessionAt,
    isMe,
  });

  const screen = String(member.screen ?? presence?.screen ?? "").trim();
  const used = isMe
    ? "self_in_room"
    : screen === "room"
      ? "screen_room"
      : display.unified === "in_call"
        ? "peer_or_audio"
        : presence
          ? "presence"
          : "session_member";

  return {
    status: display.participation,
    label: display.label,
    internal: display.internal,
    used,
    reason: display.reason,
  };
}

function applyRoomLocalLeftOverride(
  member: MemberRow,
  sessionId: string
): MemberRow {
  const did = String(member.device_id ?? "").trim();
  if (!did || !hasLocalLeftCall(sessionId, did)) return member;

  return {
    ...member,
    is_in_call: false,
    screen: "room",
  };
}

function dedupeMembers(
  list: MemberRow[],
  myDeviceId: string,
  myDisplayName: string
): MemberRow[] {
  const normalizedMyDeviceId = String(myDeviceId ?? "").trim();
  const normalizedMyName = normalizeName(myDisplayName);
  const latestByDevice = pickLatestSessionMemberByDevice(list);

  const others = new Map<string, MemberRow>();
  let me: MemberRow | null = null;

  for (const row of latestByDevice.values()) {
    const did = String(row.device_id ?? "").trim();
    if (!did) continue;

    const photoPath =
      row.photo_path && String(row.photo_path).trim()
        ? String(row.photo_path).trim()
        : null;
    const avatarUrl =
      row.avatar_url && String(row.avatar_url).trim()
        ? String(row.avatar_url).trim()
        : null;
    const joinedAt = String(row.joined_at ?? "").trim();

    const resolved = resolveDisplayName({
      profileDisplayName:
        did === normalizedMyDeviceId ? normalizedMyName : undefined,
      sessionMemberDisplayName: row.display_name,
    });

    const memberRow: MemberRow = {
      device_id: did,
      display_name: resolved.displayName,
      display_name_source: resolved.source,
      photo_path: photoPath,
      avatar_url: avatarUrl,
      joined_at: joinedAt,
      is_in_call: row.is_in_call === true,
      screen: row.screen ?? null,
      last_seen_at: row.last_seen_at ?? null,
      presence_session_id: row.presence_session_id ?? null,
    };

    const isMeByDevice =
      !!did && !!normalizedMyDeviceId && did === normalizedMyDeviceId;

    if (isMeByDevice) {
      const selfResolved = resolveDisplayName({
        profileDisplayName: normalizedMyName,
        sessionMemberDisplayName: row.display_name,
      });
      me = {
        ...memberRow,
        display_name: selfResolved.displayName,
        display_name_source: selfResolved.source,
      };
      continue;
    }

    others.set(did, memberRow);
  }

  const sortedOthers = Array.from(others.values()).sort((a, b) =>
    String(a.joined_at ?? "").localeCompare(String(b.joined_at ?? ""))
  );

  return me ? [me, ...sortedOthers] : sortedOthers;
}


function MemberAvatar({
  src,
  label,
  isMe,
}: {
  src?: string | null;
  label: string;
  isMe: boolean;
}) {
  return (
    <img
      src={src || "/default-avatar.jpg"}
      alt={label}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        if (e.currentTarget.src.includes("default-avatar")) return;
        console.warn(`[avatar] load-failed label=${label.slice(0, 24)}`);
        e.currentTarget.onerror = null;
        e.currentTarget.src = "/default-avatar.jpg";
      }}
      style={{
        width: LIST_MEMBER_AVATAR_PX,
        height: LIST_MEMBER_AVATAR_PX,
        borderRadius: "9999px",
        objectFit: "cover",
        background: "#e5e7eb",
        border: isMe ? "2px solid #22c55e" : "1px solid #d1d5db",
        flexShrink: 0,
      }}
    />
  );
}

export default function RoomClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const classId = (searchParams.get("classId") ?? "").trim();
  const sessionId =
    (searchParams.get("sessionId") ?? "").trim() ||
    (searchParams.get("session_id") ?? "").trim() ||
    (searchParams.get("session") ?? "").trim();
  const autojoin = (searchParams.get("autojoin") ?? "").trim() === "1";
  const openJoinedClass =
    (searchParams.get("openJoinedClass") ?? "").trim() === "1" ||
    (searchParams.get("openJoinedClass") ?? "").trim() === "true";
  const dev = (searchParams.get("dev") ?? "").trim();
  
  const invite = (searchParams.get("invite") ?? "").trim() === "1";
  const inviter = normalizeName(searchParams.get("inviter"));

  const profileEditHref = useMemo(
    () =>
      withDev(
        buildProfileEditPath(
          buildCurrentPathReturnTo(pathname, searchParams.toString())
        )
      ),
    [pathname, searchParams]
  );

  const [members, setMembers] = useState<MemberRow[]>([]);
  const memberEmptyStreakRef = useRef(0);
  const inviteJoinGraceUntilRef = useRef(0);
  const hasClassMembershipHintRef = useRef(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceRow>>({});
  const [topicTitle, setTopicTitle] = useState("ルーム");
  const [classLabel, setClassLabel] = useState("");
  const [err, setErr] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [status, setStatus] = useState("forming");
  const [capacity, setCapacity] = useState(5);

  const [deviceId, setDeviceId] = useState(() => getDeviceId());
  const [displayName, setDisplayName] = useState(() => {
    const id = getDeviceId();
    if (!id) return "";
    const stored = readStoredDisplayName(id);
    if (!stored || stored === "You") return "";
    return stored;
  });

  const joinedSessionKeyRef = useRef<string | null>(null);
  const autoCallAttemptedRef = useRef(false);
  const autoCallTimerRef = useRef<number | null>(null);
  const autoCallArmKeyRef = useRef<string | null>(null);
  const membersCount2SinceRef = useRef<number | null>(null);
  const membersCount2StreakRef = useRef(0);
  const presenceMapSeen2Ref = useRef(false);
  const lastSuccessfulFetchOpGenRef = useRef(0);
  const autoCallMemberIdsRef = useRef<string[]>([]);
  const roomIdentityRef = useRef({ sessionId: "", classId: "", deviceId: "" });
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );
  const [autoCallRecheckTick, setAutoCallRecheckTick] = useState(0);
  const [roomSessionReady, setRoomSessionReady] = useState(false);
  const [sessionResolving, setSessionResolving] = useState(false);
  const [callBlockTick, setCallBlockTick] = useState(0);
  const roomLifecycleReadyRef = useRef(false);
  const sessionResolvingRef = useRef(false);
  const recentRematchUntilRef = useRef(0);

  const setLifecycleReady = useCallback((ready: boolean) => {
    roomLifecycleReadyRef.current = ready;
    setRoomSessionReady(ready);
  }, []);

  const setResolving = useCallback((resolving: boolean) => {
    sessionResolvingRef.current = resolving;
    setSessionResolving(resolving);
  }, []);

  const scheduleRecentRematchUnblock = useCallback(() => {
    const remaining = recentRematchUntilRef.current - Date.now();
    if (remaining > 0) {
      window.setTimeout(() => {
        setCallBlockTick((tick) => tick + 1);
      }, remaining + 50);
    }
  }, []);

  const isCallStartBlocked = useCallback((): string | null => {
    if (sessionResolvingRef.current || !roomLifecycleReadyRef.current) {
      return "session_resolving";
    }
    if (Date.now() < recentRematchUntilRef.current) {
      return "recent_rematch";
    }
    return null;
  }, []);

  const [showDevBanner, setShowDevBanner] = useState(false);
  const [devBannerLabel, setDevBannerLabel] = useState("");

  const statusFailCountRef = useRef(0);
  const prevMemberStatusRef = useRef<Record<string, UiParticipationStatus>>({});
  const lastInSessionAtRef = useRef<Record<string, number>>({});
  const sessionMemberIdsForPresenceRef = useRef<Set<string>>(new Set());
  const prevMemberInternalRef = useRef<
    Record<string, import("@/lib/memberStatus").InternalMemberStatus>
  >({});
  const roomOpGenRef = useRef(0);

  const cancelAutoCallTimer = useCallback((reason: string) => {
    if (autoCallTimerRef.current !== null) {
      window.clearTimeout(autoCallTimerRef.current);
      autoCallTimerRef.current = null;
      console.log(`[room-auto-call] cancel reason=${reason}`);
    }
    autoCallArmKeyRef.current = null;
  }, []);

  const bumpRoomAsync = useCallback((reason: string) => {
    roomOpGenRef.current += 1;
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[room-async] bump reason=${reason} gen=${roomOpGenRef.current}`
      );
    }
  }, []);

  const shouldAbortRoomAsync = useCallback(
    (gen: number, cid: string, context: string): boolean => {
      if (gen !== roomOpGenRef.current) {
        logRoomAsyncIgnored(cid, "op_stale", context);
        return true;
      }
      if (isClassLeftLocally(cid)) {
        logRoomAsyncIgnored(cid, "class_left", context);
        return true;
      }
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/room"
      ) {
        logRoomAsyncIgnored(cid, "not_on_room", context);
        return true;
      }
      return false;
    },
    []
  );

  const [profileTarget, setProfileTarget] = useState<MemberProfileTarget | null>(
    null
  );
  const [meetingPlan, setMeetingPlan] = useState<MeetingPlanPublic | null>(null);
  const [callRequest, setCallRequest] = useState<CallRequestPublic | null>(null);

  const publicStorageBase =
    process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-photos`
      : "";

function setSoftConnectionError(kind: "status" | "messages") {
  if (kind === "status") {
    statusFailCountRef.current += 1;
    if (statusFailCountRef.current >= 3) {
      setErr("接続が不安定です。再接続しています…");
    }
  }
}

function clearSoftConnectionError(kind?: "status" | "messages") {
  if (!kind || kind === "status") statusFailCountRef.current = 0;

  setErr((prev) => {
    if (prev === "接続が不安定です。再接続しています…") return "";
    return prev;
  });
}

  useEffect(() => {
    roomIdentityRef.current = {
      sessionId: String(sessionId ?? "").trim(),
      classId: String(classId ?? "").trim(),
      deviceId: String(deviceId ?? "").trim(),
    };
  }, [sessionId, classId, deviceId]);

  useEffect(() => {
    membersCount2SinceRef.current = null;
    membersCount2StreakRef.current = 0;
    presenceMapSeen2Ref.current = false;
    lastSuccessfulFetchOpGenRef.current = 0;
    autoCallAttemptedRef.current = false;
    setLifecycleReady(false);
    setResolving(false);
    cancelAutoCallTimer("session_changed");
  }, [
    sessionId,
    classId,
    deviceId,
    cancelAutoCallTimer,
    setLifecycleReady,
    setResolving,
  ]);

  useEffect(() => {
    const onVisibility = () => {
      const visible = !document.hidden;
      setPageVisible(visible);
      if (!visible) {
        cancelAutoCallTimer("page_hidden");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [cancelAutoCallTimer]);

  useEffect(() => {
    bumpRoomAsync("session_changed");
  }, [sessionId, classId, bumpRoomAsync]);

  useEffect(() => {
    return () => {
      bumpRoomAsync("unmount");
    };
  }, [bumpRoomAsync]);

  /** Return to Home — keeps session_members and class_memberships; presence only. */
  const goHome = useCallback(() => {
    bumpRoomAsync("return_home");

    const did = String(deviceId ?? "").trim();
    const cid = String(classId ?? "").trim();

    logNavigationIntent("return_home", "RoomClient.goHome");
    logRouteChange(getCurrentPath(), withDev("/"), "return_home");

    if (cid) {
      clearLocallyHiddenClass(cid);
    }

    if (cid && did) {
      void fetch("/api/class/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId: cid,
          deviceId: did,
          screen: "home",
        }),
        cache: "no-store",
      })
        .then((res) => {
          if (res.ok) {
            console.log(
              `[room] return-home presence=screen=home class=${cid.slice(-6)} ` +
                `session=${sessionId.slice(-6)} device=${did.slice(-4)}`
            );
          }
        })
        .catch((e) => {
          console.warn("[room] return-home presence failed", {
            classId: cid.slice(-6),
            error: e instanceof Error ? e.message : String(e),
          });
        });
    }

    router.push(withDev("/"));
  }, [bumpRoomAsync, classId, deviceId, router, sessionId]);

  useEffect(() => {
    const id = String(getDeviceId() ?? "").trim();
    setDeviceId(id);
  }, [dev]);

  useEffect(() => {
    if (!deviceId) return;
    logDeviceIdInit(deviceId, "room");
    logDeviceIdStability(deviceId, "room");
  }, [deviceId, sessionId, classId]);

  useEffect(() => {
    if (!classId || !sessionId || !deviceId) return;
    const joinedKey = joinedSessionKeyRef.current ?? "";
    const joinedSession = joinedKey.includes(":")
      ? joinedKey.split(":")[0]
      : joinedKey || "-";
    console.log(
      `[room-session] device=${deviceId.slice(-4)} class=${classId.slice(-6)} ` +
        `session=${sessionId.slice(-6)} urlSession=${sessionId.slice(-6)} ` +
        `joinedSession=${
          joinedSession !== "-" ? String(joinedSession).slice(-6) : "-"
        } openJoinedClass=${openJoinedClass ? 1 : 0}`
    );
  }, [classId, sessionId, deviceId, openJoinedClass]);

  useEffect(() => {
    if (pathname !== "/room") return;
    if (!invite || !classId || !sessionId) return;

    logInviteRoute("detected", {
      classId,
      sessionId,
      invite: true,
    });

    storeInviteRouteState({
      classId,
      sessionId,
      invite: true,
      storedAt: Date.now(),
    });

    logInviteRoute("stored", { classId, sessionId, invite: true });
  }, [pathname, invite, classId, sessionId]);

  useEffect(() => {
    if (pathname !== "/room") return;
    const stored = readInviteRouteState();
    if (!stored) return;

    logInviteRoute("restored", {
      classId,
      sessionId,
      storedClassId: stored.classId,
      storedSessionId: stored.sessionId,
      invite: stored.invite,
    });

    if (
      stored.classId &&
      classId &&
      stored.classId !== classId
    ) {
      logInviteRoute("mismatch", {
        classId,
        sessionId,
        storedClassId: stored.classId,
        storedSessionId: stored.sessionId,
        step: "classId",
      });
    }
    if (
      stored.sessionId &&
      sessionId &&
      stored.sessionId !== sessionId
    ) {
      logInviteRoute("mismatch", {
        classId,
        sessionId,
        storedClassId: stored.classId,
        storedSessionId: stored.sessionId,
        step: "sessionId",
      });
    }
  }, [pathname, classId, sessionId]);

  useEffect(() => {
    if (!sessionId || !deviceId) return;
    if (getNavigationType() === "reload") {
      const sanitized = sanitizeLocalLeftCallAfterReload(sessionId, deviceId);
      if (sanitized.cleared) {
        console.log(
          `[room-status] reload-cleared-local-exit reason=${sanitized.previousReason ?? "-"} ` +
            `session=${sessionId.slice(-8)} device=${deviceId.slice(-3)}`
        );
      }
    }
  }, [sessionId, deviceId]);

  useEffect(() => {
    if (!classId || !deviceId) return;

    let cancelled = false;

    async function markClassMessagesRead() {
      try {
        await fetch("/api/class/messages/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            device_id: deviceId,
            class_id: classId,
          }),
        });
      } catch {
        if (!cancelled) {
          // ignore; badge clears on next home refresh
        }
      }
    }

    void markClassMessagesRead();
  }, [classId, deviceId]);

  useEffect(() => {
    if (!classId || !deviceId) return;

    let cancelled = false;

    async function loadMeetingPlan() {
      try {
        const res = await fetch(
          `/api/class/meeting-plan?class_id=${encodeURIComponent(classId)}&device_id=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setMeetingPlan(null);
          return;
        }
        setMeetingPlan((json.plan as MeetingPlanPublic | null) ?? null);
      } catch {
        if (!cancelled) setMeetingPlan(null);
      }
    }

    let timer: number | null = null;
    const startTimer = window.setTimeout(() => {
      void loadMeetingPlan();
      timer = window.setInterval(loadMeetingPlan, 30000);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (timer) window.clearInterval(timer);
    };
  }, [classId, deviceId]);

  useEffect(() => {
    if (!classId || !deviceId) return;

    let cancelled = false;

    async function loadCallRequest() {
      try {
        const res = await fetch(
          `/api/class/call-request?class_id=${encodeURIComponent(classId)}&device_id=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setCallRequest(null);
          return;
        }
        setCallRequest((json.request as CallRequestPublic | null) ?? null);
      } catch {
        if (!cancelled) setCallRequest(null);
      }
    }

    let timer: number | null = null;
    const startTimer = window.setTimeout(() => {
      void loadCallRequest();
      timer = window.setInterval(loadCallRequest, 15000);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (timer) window.clearInterval(timer);
    };
  }, [classId, deviceId]);

  useEffect(() => {
    const active = isDevMode();
    const key = getDevUserKey();

    setShowDevBanner(active);
    setDevBannerLabel(key ? `(${key})` : "");
  }, [dev]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileName() {
      if (!deviceId) return;

      try {
        const res = await fetch(
          `/api/profile?device_id=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );

        const rawText = await res.text().catch(() => "");
        let data: ProfileResponse | null = null;

        try {
          data = rawText ? (JSON.parse(rawText) as ProfileResponse) : null;
        } catch {
          data = null;
        }

        if (!res.ok || !data?.ok) {
          if (!cancelled && !displayName) {
            const fallback = readStoredDisplayName(deviceId) || "参加者";
            const safeName = fallback === "You" ? "参加者" : fallback;
            setDisplayName(safeName);
          }
          return;
        }

        const canonical =
          normalizeName(data?.profile?.display_name) ||
          readStoredDisplayName(deviceId) ||
          "参加者";

        if (!cancelled) {
          const safeName = canonical === "You" ? "参加者" : canonical;
          setDisplayName(safeName);
          writeStoredDisplayName(deviceId, safeName);
        }
      } catch {
        if (!cancelled && !displayName) {
          const fallback = readStoredDisplayName(deviceId) || "参加者";
          const safeName = fallback === "You" ? "参加者" : fallback;
          setDisplayName(safeName);
        }
      }
    }

    void loadProfileName();

    return () => {
      cancelled = true;
    };
  }, [deviceId, displayName]);

  useEffect(() => {
    let cancelled = false;

    async function loadClassMeta() {
      if (!deviceId || !classId) return;

      try {
        const res = await fetch(
          `/api/class/mine?deviceId=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );
        const json = await readJsonSafe(res);

        if (cancelled) return;
        if (!res.ok || !json?.ok) return;

        const classes = Array.isArray(json?.classes) ? json.classes : [];
        const matched = classes.find(
          (c: MineClassRow) =>
            String(c?.id ?? "").trim() === classId ||
            String(c?.class_id ?? "").trim() === classId
        ) as MineClassRow | undefined;

        if (!matched) return;

        const nextTopicTitle = formatTopicTitleFromClassRow(matched);
        const nextClassLabel = formatClassLabelFromClassRow(matched);

        if (nextTopicTitle) setTopicTitle(nextTopicTitle);
        if (nextClassLabel) setClassLabel(nextClassLabel);
      } catch (e) {
        console.error("[room] class meta load failed", e);
      }
    }

    void loadClassMeta();

    return () => {
      cancelled = true;
    };
  }, [deviceId, classId]);

  const visibleMembers = useMemo(() => {
    return dedupeMembers(members, deviceId, displayName);
  }, [members, deviceId, displayName]);

  useEffect(() => {
    autoCallMemberIdsRef.current = visibleMembers
      .map((m) => String(m.device_id ?? "").trim())
      .filter(Boolean);
  }, [visibleMembers]);

  useEffect(() => {
    sessionMemberIdsForPresenceRef.current = new Set(
      visibleMembers
        .map((m) => String(m.device_id ?? "").trim())
        .filter(Boolean)
    );
  }, [visibleMembers]);

  useEffect(() => {
    const viewerId = String(deviceId ?? "").trim();
    if (!sessionId || !viewerId) return;
    if (!hasLocalLeftCall(sessionId, viewerId)) return;

    setMembers((prev) => {
      let changed = false;
      const next = prev.map((member) => {
        if (String(member.device_id ?? "").trim() !== viewerId) return member;
        if (member.is_in_call === false && member.screen === "room") return member;
        changed = true;
        return {
          ...member,
          is_in_call: false,
          screen: "room",
        };
      });
      return changed ? next : prev;
    });
  }, [sessionId, deviceId]);

  useEffect(() => {
    if (!sessionId) return;

    const nextStatuses: Record<string, UiParticipationStatus> = {};
    const nextInternals: Record<
      string,
      import("@/lib/memberStatus").InternalMemberStatus
    > = {};
    const nowMs = Date.now();
    const nextLastInSessionAt: Record<string, number> = {
      ...lastInSessionAtRef.current,
    };

    const sessionMemberIds = sessionMemberIdsForPresenceRef.current;

    for (const member of visibleMembers) {
      const did = String(member.device_id ?? "").trim();
      if (!did) continue;

      const inSession = sessionMemberIds.has(did);
      if (inSession) {
        nextLastInSessionAt[did] = nowMs;
      }

      const isMe = did === String(deviceId ?? "").trim();
      const display = resolveRoomMemberDisplay(
        member,
        presenceMap[did],
        sessionId,
        prevMemberStatusRef.current[did] ?? null,
        isMe,
        deviceId,
        nextLastInSessionAt[did],
        prevMemberInternalRef.current[did] ?? null,
        inSession
      );

      nextStatuses[did] = display.status;
      nextInternals[did] = display.internal;

      const prevStatus = prevMemberStatusRef.current[did] ?? null;
      if (prevStatus !== display.status) {
        logParticipationStatusDecision({
          context: "room",
          deviceId: did,
          label: display.label,
          status: display.status,
          used: display.used,
          reason: display.reason,
          sources: {
            is_in_call: member.is_in_call ?? null,
            screen: member.screen ?? presenceMap[did]?.screen ?? null,
            last_seen_at:
              member.last_seen_at ?? presenceMap[did]?.last_seen_at ?? null,
            presence_session_id:
              member.presence_session_id ??
              presenceMap[did]?.presence_session_id ??
              null,
            localExitedCall: hasLocalLeftCall(sessionId, did),
            sessionId,
            isMe,
          },
        });
      }
    }

    const visibleIds = new Set(
      visibleMembers
        .map((m) => String(m.device_id ?? "").trim())
        .filter(Boolean)
    );
    for (const did of Object.keys(nextLastInSessionAt)) {
      if (!visibleIds.has(did)) {
        delete nextLastInSessionAt[did];
      }
    }
    lastInSessionAtRef.current = nextLastInSessionAt;
    prevMemberStatusRef.current = nextStatuses;
    prevMemberInternalRef.current = nextInternals;
  }, [visibleMembers, presenceMap, sessionId, deviceId]);

  const selfRejoinSessionIfMissing = useCallback(async (): Promise<boolean> => {
    if (!sessionId || !classId || !deviceId) return true;
    if (isClassLeftLocally(classId)) {
      logRoomAsyncIgnored(classId, "class_left", "self_rejoin");
      return false;
    }

    const checkQs = new URLSearchParams({
      sessionId,
      classId,
      lite: "1",
      viewerDeviceId: deviceId,
    });

    try {
      const checkRes = await fetchWithRetry(
        `/api/session/status?${checkQs.toString()}`,
        { cache: "no-store" },
        { kind: "members", maxAttempts: 2 }
      );
      const checkJson = (await checkRes.json().catch(() => null)) as
        | SessionStatusResponse
        | null;

      if (checkRes.ok && checkJson?.viewerState?.inSessionMembers === true) {
        return true;
      }
    } catch {
      // fall through to rejoin attempt
    }

    const rawName = String(displayName ?? "").trim() || "参加者";
    const name = rawName === "You" ? "参加者" : rawName;

    console.log(
      `[session-members] self-rejoin start context=room device=${deviceId.slice(-4)} ` +
        `session=${sessionId.slice(-6)} class=${classId.slice(-6)}`
    );

    try {
      const joinRes = await fetch(
        `/api/session/join?sessionId=${encodeURIComponent(sessionId)}&classId=${encodeURIComponent(classId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            classId,
            deviceId,
            name,
            capacity: 5,
            openJoinedClass,
          }),
          cache: "no-store",
        }
      );

      const joinJson = (await joinRes.json().catch(() => null)) as
        | SessionJoinResponse
        | null;

      if (!joinRes.ok || !joinJson?.ok) {
        const joinError = String(joinJson?.error ?? joinRes.status);
        if (joinError === "membership_left") {
          logRoomAsyncIgnored(classId, "class_left", "self_rejoin");
        } else {
          console.warn(
            `[session-members] self-rejoin failed context=room device=${deviceId.slice(-4)} ` +
              `session=${sessionId.slice(-6)} error=${joinError}`
          );
        }
        return false;
      }

      joinedSessionKeyRef.current = `${sessionId}:${classId}:${deviceId}:${name}`;
      hasClassMembershipHintRef.current = true;
      console.log(
        `[session-members] self-rejoin ok context=room device=${deviceId.slice(-4)} ` +
          `session=${sessionId.slice(-6)} memberCount=${joinJson.memberCount ?? "-"}`
      );
      return true;
    } catch (e) {
      console.warn("[room] self-rejoin failed", e);
      return false;
    }
  }, [classId, deviceId, displayName, openJoinedClass, sessionId]);

  const fetchStatus = useCallback(
    async (opts?: { force?: boolean; fast?: boolean }) => {
      if (!sessionId || !classId) return;
      if (pathname !== "/room") return;
      if (sessionResolvingRef.current || !roomLifecycleReadyRef.current) {
        return;
      }
      if (isClassLeftLocally(classId)) {
        logRoomAsyncIgnored(classId, "class_left", "fetchStatus");
        return;
      }
      if (!opts?.force && typeof document !== "undefined" && document.hidden) {
        return;
      }

      const opGen = roomOpGenRef.current;

      const rejoinOk = await selfRejoinSessionIfMissing();
      if (shouldAbortRoomAsync(opGen, classId, "fetchStatus_after_rejoin")) {
        return;
      }
      if (!rejoinOk) {
        console.warn(
          `[session-members] fetchStatus deferred context=room reason=self_rejoin_failed ` +
            `session=${sessionId.slice(-6)} device=${String(deviceId ?? "").slice(-4)}`
        );
        return;
      }

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);

      try {
        const qs = new URLSearchParams({ sessionId, classId, lite: "1" });
        if (opts?.fast) {
          qs.set("fast", "1");
        }
        if (deviceId) {
          qs.set("viewerDeviceId", deviceId);
        }

        const res = await fetchWithRetry(
          `/api/session/status?${qs.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
          { kind: "members", maxAttempts: 3 }
        );

        if (shouldAbortRoomAsync(opGen, classId, "fetchStatus_response")) {
          return;
        }

        const rawText = await res.text().catch(() => "");
        let json: SessionStatusResponse | null = null;

        try {
  json = rawText ? (JSON.parse(rawText) as SessionStatusResponse) : null;
} catch {
  json = null;
}


if (!res.ok || !json?.ok) {
          setSoftConnectionError("status");
          console.warn(
            `[session-members] api-result ok=false context=room reason=fetchStatus ` +
              `status=${res.status} session=${sessionId.slice(-6)} class=${classId.slice(-6)}`
          );
          return;
        }

        const incomingMembers = (Array.isArray(json.members) ? json.members : []).map(
          (member) => applyRoomLocalLeftOverride(member, sessionId)
        );

        console.log(
          `[session-members] api-result context=room count=${incomingMembers.length} ` +
            `ids=${compactMemberDeviceIds(incomingMembers)} session=${sessionId.slice(-6)}`
        );

        let redirectRemoved = false;

        const inviteGraceActive = isInviteJoinGraceActive(
          inviteJoinGraceUntilRef.current
        );

        setMembers((prev) => {
          const decision = evaluateMemberListApply({
            fetchOk: true,
            reason: "fetchStatus",
            prevMembers: prev,
            nextMembers: incomingMembers,
            viewerDeviceId: deviceId,
            emptyStreak: memberEmptyStreakRef.current,
            inviteGraceActive,
            hasClassMembershipHint: hasClassMembershipHintRef.current,
            viewerInSessionMembers: json.viewerState?.inSessionMembers,
          });

          memberEmptyStreakRef.current = decision.nextEmptyStreak;

          const { removed, added } = diffMemberDeviceIds(prev, incomingMembers);

          logRoomMembersBeforeUpdate({
            context: "room",
            reason: "fetchStatus",
            sessionId,
            classId,
            currentCount: prev.length,
            nextCount: incomingMembers.length,
            currentIds: compactMemberDeviceIds(prev),
            nextIds: compactMemberDeviceIds(incomingMembers),
            apply: decision.apply,
            ignoreReason: decision.ignoreReason,
            removed,
            added,
          });

          if (!decision.apply) {
            if (
              decision.ignoreReason === "invite_grace" ||
              decision.ignoreReason === "temporary_empty_response"
            ) {
              if (decision.ignoreReason === "invite_grace") {
                logRoomMembersInviteGraceIgnored({
                  reason: "fetchStatus",
                  graceMsRemaining: getInviteGraceRemainingMs(
                    inviteJoinGraceUntilRef.current
                  ),
                  previousCount: prev.length,
                  emptyStreak: decision.nextEmptyStreak,
                });
              } else {
                logRoomMembersEmptyIgnored({
                  context: "room",
                  reason: "fetchStatus",
                  emptyStreak: decision.nextEmptyStreak,
                  required: MEMBER_LIST_EMPTY_STREAK_REQUIRED,
                });
              }
            }
            return prev;
          }

          if (decision.shouldRedirectRemoved) {
            redirectRemoved = true;
            logRoomMembersRemoved({
              context: "room",
              deviceTail: String(deviceId).slice(-4),
              reason: "session_status_viewer_missing",
            });
            return prev;
          }

          const prevNorm = JSON.stringify(normalizeMemberCompare(prev));
          const nextNorm = JSON.stringify(normalizeMemberCompare(incomingMembers));
          if (prevNorm === nextNorm) return prev;
          logMemberDisplayNamesFromApi("room:session/status", incomingMembers);
          return incomingMembers;
        });

        if (redirectRemoved) {
          if (shouldAbortRoomAsync(opGen, classId, "fetchStatus_redirect")) {
            return;
          }
          setErr("このクラスから退出済みです。");
          logNavigationIntent("removed_from_session", "RoomClient.fetchMembers");
          logRouteChange(getCurrentPath(), "/", "removed_from_session");
          router.replace(withDev("/"));
          return;
        }

        lastSuccessfulFetchOpGenRef.current = opGen;

        if (incomingMembers.length >= 2) {
          membersCount2StreakRef.current += 1;
          if (membersCount2SinceRef.current === null) {
            membersCount2SinceRef.current = Date.now();
          }
        } else {
          membersCount2StreakRef.current = 0;
          membersCount2SinceRef.current = null;
        }

        const inCallCount = incomingMembers.filter((m) => m.is_in_call === true).length;
        console.log(
          `[session-members] context=room session=${sessionId.slice(-6)} ` +
            `count=${incomingMembers.length} ids=${compactMemberDeviceIds(incomingMembers)} ` +
            `class=${classId.slice(-6)} inCall=${inCallCount}`
        );

        if (!topicTitle && json.session?.topic) {
          setTopicTitle(String(json.session.topic).trim() || "ルーム");
        }
        if (json.session?.status) setStatus(String(json.session.status));
        if (Number.isFinite(Number(json.session?.capacity))) {
          setCapacity(Number(json.session?.capacity));
        }

        const nextCount = Number(json.memberCount ?? incomingMembers.length ?? 0);
        setMemberCount(Math.max(nextCount, 0));
        clearSoftConnectionError("status");
      } catch (e: any) {
        if (e?.name !== "AbortError") setSoftConnectionError("status");
      } finally {
        window.clearTimeout(timer);
      }
    },
    [
      sessionId,
      classId,
      pathname,
      topicTitle,
      deviceId,
      router,
      selfRejoinSessionIfMissing,
      shouldAbortRoomAsync,
    ]
  );

  useEffect(() => {
    if (!classId || !sessionId || !deviceId) return;
    if (pathname !== "/room") return;
    if (!roomSessionReady || sessionResolving) return;

    async function sendPresence() {
      if (isClassLeftLocally(classId)) {
        logRoomAsyncIgnored(classId, "class_left", "presence");
        return;
      }
      const res = await fetch("/api/class/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          deviceId,
          screen: "room",
          sessionId,
        }),
        cache: "no-store",
      }).catch((e) => {
        console.warn("[room] presence update failed", {
          screen: "room",
          sessionId: sessionId.slice(-6),
          classId: classId.slice(-6),
          deviceId: deviceId.slice(-4),
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      });

      if (res?.ok && process.env.NEXT_PUBLIC_DEBUG_VOICE === "1") {
        console.log(
          `[room] presence update screen=room session=${sessionId.slice(-6)} ` +
            `class=${classId.slice(-6)} device=${deviceId.slice(-4)}`
        );
      }
    }

    void sendPresence();

    const schedulePresence = () => {
      if (timer) window.clearInterval(timer);
      const ms =
        typeof document !== "undefined" && document.hidden ? 30_000 : 10_000;
      timer = window.setInterval(() => {
        if (window.location.pathname !== "/room") return;
        if (typeof document !== "undefined" && document.hidden) return;
        void sendPresence();
      }, ms);
    };

    let timer: number | null = null;
    schedulePresence();

    const onPresenceVisibility = () => {
      schedulePresence();
      if (document.visibilityState === "visible") {
        void sendPresence();
      }
    };
    document.addEventListener("visibilitychange", onPresenceVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onPresenceVisibility);
      if (timer) window.clearInterval(timer);
    };
  }, [classId, sessionId, deviceId, pathname, roomSessionReady, sessionResolving]);

  useEffect(() => {
    if (!classId) return;
    if (pathname !== "/room") return;
    if (!roomSessionReady || sessionResolving) return;

    let cancelled = false;

    async function loadPresence(opts?: { force?: boolean }) {
      if (!classId) return;
      if (pathname !== "/room") return;
      if (isClassLeftLocally(classId)) {
        logRoomAsyncIgnored(classId, "class_left", "loadPresence");
        return;
      }
      if (!opts?.force && typeof document !== "undefined" && document.hidden) {
        return;
      }

      const opGen = roomOpGenRef.current;
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(
          `/api/class/presence?classId=${encodeURIComponent(classId)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!res.ok) return;

        const json = await readJsonSafe(res);
        if (cancelled) return;
        if (shouldAbortRoomAsync(opGen, classId, "loadPresence_response")) {
          return;
        }
        if (!json?.ok) return;

        const list = Array.isArray(json?.presence) ? json.presence : [];
        const nextMap: Record<string, PresenceRow> = {};

        const sessionMemberIds = sessionMemberIdsForPresenceRef.current;
        let ignoredNonMember = 0;
        let ignoredStale = 0;

        for (const row of list) {
          const mapped = mapPresenceApiRow(
            row as Record<string, unknown>,
            sessionId
          );
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
            Number.isFinite(t) && Date.now() - t <= PRESENCE_FRESH_MS_ROOM;
          if (!fresh) {
            ignoredStale += 1;
            continue;
          }

          nextMap[did] = mapped;
        }

        console.log(
          `[room] presence map session=${sessionId.slice(-6)} count=${Object.keys(nextMap).length} ` +
            `ignoredNonMember=${ignoredNonMember} ignoredStale=${ignoredStale} ` +
            `sessionMembers=${sessionMemberIds.size}`
        );

        if (sessionMemberIds.size >= 2) {
          presenceMapSeen2Ref.current = true;
        }

        setPresenceMap((prev) => {
          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(nextMap);
          return prevStr === nextStr ? prev : nextMap;
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          console.warn("[room] presence load failed", e);
        }
      } finally {
        window.clearTimeout(timer);
      }
    }

    void loadPresence({ force: true });

    const timer = window.setInterval(() => {
      if (window.location.pathname !== "/room") return;
      void loadPresence();
    }, 5000);

    const onVisible = () => {
      if (document.hidden) return;
      void loadPresence({ force: true });
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    classId,
    sessionId,
    pathname,
    shouldAbortRoomAsync,
    roomSessionReady,
    sessionResolving,
  ]);

  useEffect(() => {
    if (!sessionId) {
      setErr("sessionId required");
      return;
    }

    if (!classId) {
      setErr("classId required");
      return;
    }

    const roomUrl = withDev(
      `/room?autojoin=1&classId=${encodeURIComponent(classId)}` +
        `&sessionId=${encodeURIComponent(sessionId)}` +
        (openJoinedClass ? "&openJoinedClass=1" : "")
    );

    pushRecentClass(
      {
        id: classId || sessionId,
        title: topicTitle || classLabel || "ルーム",
        url: roomUrl,
      },
      20
    );
  }, [classId, sessionId, topicTitle, classLabel, openJoinedClass]);

  useEffect(() => {
  if (pathname !== "/room") return;

  if (!sessionId || !deviceId) {
  joinedSessionKeyRef.current = null;
  setLifecycleReady(false);
  return;
}

  if (!displayName) return;

const rawName = displayName;
const name = rawName === "You" ? "参加者" : rawName;

  const joinKey = `${sessionId}:${classId}:${deviceId}:${name}`;

  if (joinedSessionKeyRef.current === joinKey) {
  console.log("[room join] skip duplicate");
  setLifecycleReady(true);
  setResolving(false);
  return;
}

  let cancelled = false;
  const joinOpGen = roomOpGenRef.current;

  const shouldAbortJoin = () =>
    cancelled ||
    joinOpGen !== roomOpGenRef.current ||
    isClassLeftLocally(classId) ||
    (typeof window !== "undefined" && window.location.pathname !== "/room");

  async function redirectToResolvedSession(params: {
    oldSessionId: string;
    nextSessionId: string;
    nextClassId: string;
    reason: string;
  }) {
    console.log(
      `[room-session] resolve-before-start reason=${params.reason} ` +
        `oldSession=${params.oldSessionId.slice(-6)}`
    );

    bumpRoomAsync("session_resolved");
    cancelAutoCallTimer("recent_rematch");
    joinedSessionKeyRef.current = null;
    setLifecycleReady(false);

    recentRematchUntilRef.current =
      Date.now() + RECENT_REMATCH_CALL_BLOCK_MS;
    scheduleRecentRematchUnblock();

    if (hasAutoCallOnce(params.oldSessionId, deviceId)) {
      transferAutoCallOnce(
        params.oldSessionId,
        params.nextSessionId,
        deviceId
      );
    }

    console.log(
      `[room-session] resolved-joinable-session newSession=${params.nextSessionId.slice(-6)}`
    );

    router.replace(
      withDev(
        `/room?autojoin=1&classId=${encodeURIComponent(params.nextClassId)}` +
          `&sessionId=${encodeURIComponent(params.nextSessionId)}`
      )
    );
  }

  async function join() {
  try {
    setResolving(true);
    cancelAutoCallTimer("session_resolving");

    if (shouldAbortJoin()) {
      logRoomAsyncIgnored(classId, "op_stale", "join");
      setResolving(false);
      return;
    }
    if (!deviceId) {
      logInviteJoinClient("failed", {
        classId,
        sessionId,
        deviceId: "",
        step: "device_not_ready",
        error: "device_missing",
        deviceReady: false,
      });
      throw new Error("端末IDの準備ができていません。ページを再読み込みしてください。");
    }

    logInviteJoinClient("start", {
      classId,
      sessionId,
      deviceId,
      deviceReady: true,
    });

    if (invite) {
      logInviteRoute("join-start", { classId, sessionId, invite: true });

      const inviteRes = await fetch("/api/class/join-by-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
  classId,
  sessionId, // ← 追加
  deviceId,
}),
        cache: "no-store",
      });

      const inviteJson = await readJsonSafe(inviteRes);

      if (!inviteRes.ok || !inviteJson?.ok) {
        const errCode = String(inviteJson?.error ?? `http_${inviteRes.status}`);
        logInviteJoinClient("failed", {
          classId,
          sessionId,
          deviceId,
          step: "join-by-invite",
          error: errCode,
        });
        logInviteRoute("join-failed", {
          classId,
          sessionId,
          error: errCode,
          step: "join-by-invite",
        });

        if (inviteJson?.error === "class_slots_limit") {
          throw new Error("参加できるクラス数の上限に達しています");
        }

        throw new Error("招待されたクラスへの参加に失敗しました");
      }

      logInviteJoinClient("success", { classId, sessionId, deviceId });
      hasClassMembershipHintRef.current = true;
      inviteJoinGraceUntilRef.current = Date.now() + INVITE_JOIN_GRACE_MS;
      markJoinedClassesStale(classId);
      markAutoCallOnce(sessionId, deviceId);
    }

    console.log("[room join] request", {
      urlSessionId: sessionId,
      classId,
      deviceId,
      openJoinedClass,
    });

    if (shouldAbortJoin()) {
      logRoomAsyncIgnored(classId, "op_stale", "join_before_session_join");
      setResolving(false);
      return;
    }

    const res = await fetch(
      `/api/session/join?sessionId=${encodeURIComponent(sessionId)}&classId=${encodeURIComponent(classId)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          classId: classId || undefined,
          deviceId,
          name,
          capacity: 5,
          invite: searchParams.get("invite") === "1",
          openJoinedClass,
        }),
        cache: "no-store",
      }
    );

      const rawText = await res.text().catch(() => "");
      let json: SessionJoinResponse | null = null;

      try {
        json = rawText ? (JSON.parse(rawText) as SessionJoinResponse) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        const error = json?.error || rawText;

        logInviteJoinClient("failed", {
          classId,
          sessionId,
          deviceId,
          step: "session_join",
          error: String(error),
        });

        if (error === "admission_closed") {
          console.warn(
            `[admission] blocked reason=closed path=room_session_join_after_invite ` +
              `invite=${invite} session=${sessionId.slice(-6)}`
          );
        }

        if (error === "membership_left") {
          logRoomAsyncIgnored(classId, "class_left", "session_join");
          setResolving(false);
          return;
        }

        if (error === "session_full") {
          throw new Error("このクラスは満員です");
        }

        if (error === "session_not_found") {
          throw new Error("ルームが見つかりません");
        }

        if (error === "session_closed" || error === "recruitment_closed") {
  if (shouldAbortJoin()) {
    logRoomAsyncIgnored(classId, "op_stale", "join_before_resolve");
    setResolving(false);
    return;
  }
  if (isClassLeftLocally(classId)) {
    logRoomRematchBlocked(classId);
    setResolving(false);
    return;
  }

  const { rematchRes, rematchJson, blocked } = await rematchRoomSession({
    deviceId,
    classId,
    openJoinedClassId: classId,
    shouldAbort: shouldAbortJoin,
  });

  if (blocked || shouldAbortJoin()) {
    setResolving(false);
    return;
  }

  const nextSessionId = String(
    rematchJson?.sessionId ?? rematchJson?.session_id ?? ""
  ).trim();

  const nextClassId = String(
    rematchJson?.classId ?? rematchJson?.class_id ?? classId
  ).trim();

  if (nextClassId && isClassLeftLocally(nextClassId)) {
    logRoomRematchBlocked(nextClassId);
    setResolving(false);
    return;
  }

  if (
    rematchRes?.ok &&
    rematchJson?.ok &&
    nextSessionId &&
    nextClassId &&
    !shouldAbortJoin()
  ) {
    redirectToResolvedSession({
      oldSessionId: sessionId,
      nextSessionId,
      nextClassId,
      reason: String(error),
    });
    return;
  }

  if (shouldAbortJoin() || isClassLeftLocally(classId)) {
    setResolving(false);
    return;
  }

  throw new Error("新しい待機ルームを作成できませんでした");
}

        if (error === "session_class_mismatch") {
          throw new Error("招待リンクが壊れています");
        }

        if (error === "sessionId must be uuid") {
          throw new Error("招待リンクが壊れています");
        }

        if (error === "classId must be uuid") {
          throw new Error("招待リンクが壊れています");
        }

        if (error === "class_slots_limit") {
          throw new Error("参加できるクラス数の上限に達しています");
        }

        throw new Error("参加に失敗しました");
      }

      if (shouldAbortJoin()) {
        setResolving(false);
        return;
      }

      console.log(
        `[room-session] join-success device=${deviceId.slice(-4)} class=${classId.slice(-6)} ` +
          `session=${sessionId.slice(-6)} urlSession=${sessionId.slice(-6)} ` +
          `joinedSession=${String(json?.sessionId ?? sessionId).slice(-6)} ` +
          `openJoinedClass=${openJoinedClass ? 1 : 0} memberCount=${json?.memberCount ?? "-"}`
      );

      joinedSessionKeyRef.current = joinKey;
      setLifecycleReady(true);
      setResolving(false);

      hasClassMembershipHintRef.current = true;
      inviteJoinGraceUntilRef.current = Date.now() + INVITE_JOIN_GRACE_MS;

      if (invite) {
        logInviteRoute("join-success", { classId, sessionId, invite: true });
        storeInviteRouteState({
          classId,
          sessionId,
          invite: true,
          storedAt: Date.now(),
        });
      }

      logInviteJoinClient("success", {
        classId,
        sessionId,
        deviceId,
        step: invite ? "invite+session_join" : "session_join",
      });

setMembers((prev) => {
  const exists = prev.some(
    (m) => String(m.device_id ?? "").trim() === String(deviceId).trim()
  );

  if (exists) return prev;

  return [
    {
      device_id: deviceId,
      display_name: name,
      joined_at: new Date().toISOString(),
    },
    ...prev,
  ];
});

setMemberCount((prev) => Math.max(prev, 1));

// エラークリアして最新取得
setErr("");
await fetchStatus({ force: true, fast: true });
void fetchStatus({ force: true });
    } catch (e: any) {
      if (shouldAbortJoin()) return;

      // ✅ 失敗時は再試行できるように固定しない
      joinedSessionKeyRef.current = null;
      setLifecycleReady(false);
      setResolving(false);

      setErr(e?.message ?? "参加に失敗しました");
    }
  }

  void join();

  return () => {
    cancelled = true;
    bumpRoomAsync("join_cleanup");
  };
}, [
  sessionId,
  classId,
  deviceId,
  displayName,
  pathname,
  fetchStatus,
  searchParams,
  openJoinedClass,
  invite,
  bumpRoomAsync,
  setLifecycleReady,
  setResolving,
  scheduleRecentRematchUnblock,
  cancelAutoCallTimer,
  router,
]);

  useEffect(() => {
    if (!sessionId || !classId) return;
    if (pathname !== "/room") return;
    if (!roomSessionReady || sessionResolving) return;

    void fetchStatus({ force: true, fast: true });

    const presenceSync = window.setTimeout(() => {
      void fetchStatus({ force: true });
    }, 1500);

    const interval = window.setInterval(() => {
      if (window.location.pathname !== "/room") return;
      void fetchStatus();
    }, 10000);

    const onVisible = () => {
      if (document.hidden) return;
      void fetchStatus({ force: true });
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(presenceSync);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    sessionId,
    classId,
    pathname,
    fetchStatus,
    roomSessionReady,
    sessionResolving,
  ]);

  useEffect(() => {
    if (!sessionId || !classId) return;
    if (pathname !== "/room") return;
    if (!roomSessionReady || sessionResolving) return;

    const channel = supabase
      .channel(`room-session-members-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_members",
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
          if (window.location.pathname !== "/room") return;
          await fetchStatus({ force: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    sessionId,
    classId,
    pathname,
    fetchStatus,
    roomSessionReady,
    sessionResolving,
  ]);

  useEffect(() => {
    if (!sessionId || !classId || !deviceId) return;
    if (pathname !== "/room") return;
    if (!autojoin) return;
    if (autoCallAttemptedRef.current) return;

    if (sessionResolving || !roomSessionReady) {
      cancelAutoCallTimer("session_resolving");
      return;
    }

    if (Date.now() < recentRematchUntilRef.current) {
      cancelAutoCallTimer("recent_rematch");
      return;
    }

    if (openJoinedClass) {
      console.log("[room-auto-call] skip reason=open_joined_class");
      return;
    }

    if (getNavigationType() === "reload") {
      console.log("[room-auto-call] skip reason=reload");
      return;
    }

    if (hasLocalLeftCall(sessionId, deviceId)) {
      console.log("[room-auto-call] skip reason=return_from_call");
      return;
    }

    if (!hasAutoCallOnce(sessionId, deviceId)) {
      console.log("[room-auto-call] skip reason=flag_missing|already_consumed");
      return;
    }

    if (!pageVisible) {
      cancelAutoCallTimer("page_hidden");
      return;
    }

    if (err) {
      cancelAutoCallTimer("members_unstable");
      return;
    }

    const joinedPrefix = `${sessionId}:${classId}:${deviceId}:`;
    if (!(joinedSessionKeyRef.current ?? "").startsWith(joinedPrefix)) {
      cancelAutoCallTimer("members_unstable");
      return;
    }

    if (lastSuccessfulFetchOpGenRef.current !== roomOpGenRef.current) {
      cancelAutoCallTimer("op_stale");
      return;
    }

    const myId = String(deviceId).trim();
    const memberIds = autoCallMemberIdsRef.current;
    const selfJoined = memberIds.includes(myId);
    const remoteJoined = memberIds.some((id) => id !== myId);
    const countReady = memberIds.length >= 2;

    if (!selfJoined || !remoteJoined || !countReady) {
      cancelAutoCallTimer("members_unstable");
      return;
    }

    const stableSince = membersCount2SinceRef.current;
    const streak = membersCount2StreakRef.current;
    const membersStable =
      streak >= 2 ||
      (stableSince !== null &&
        Date.now() - stableSince >= AUTO_CALL_MEMBERS_STABLE_MS);

    if (!membersStable) {
      cancelAutoCallTimer("members_unstable");
      if (
        stableSince !== null &&
        memberIds.length >= 2 &&
        autoCallTimerRef.current === null
      ) {
        const remaining =
          AUTO_CALL_MEMBERS_STABLE_MS - (Date.now() - stableSince);
        if (remaining > 0) {
          const recheckId = window.setTimeout(() => {
            setAutoCallRecheckTick((tick) => tick + 1);
          }, remaining + 50);
          return () => window.clearTimeout(recheckId);
        }
      }
      return;
    }

    if (!presenceMapSeen2Ref.current) {
      cancelAutoCallTimer("members_unstable");
      return;
    }

    const armKey = `${sessionId}:${classId}:${deviceId}`;
    if (autoCallTimerRef.current !== null) {
      return;
    }

    autoCallArmKeyRef.current = armKey;
    console.log(
      `[room-auto-call] arm reason=initial_match_once delayMs=${AUTO_CALL_STABLE_DELAY_MS}`
    );

    autoCallTimerRef.current = window.setTimeout(() => {
      autoCallTimerRef.current = null;
      autoCallArmKeyRef.current = null;

      const identity = roomIdentityRef.current;
      const currentArmKey = `${identity.sessionId}:${identity.classId}:${identity.deviceId}`;
      if (currentArmKey !== armKey) {
        console.log("[room-auto-call] cancel reason=session_changed");
        return;
      }

      if (autoCallAttemptedRef.current) return;

      if (document.hidden) {
        console.log("[room-auto-call] cancel reason=page_hidden");
        return;
      }

      if (lastSuccessfulFetchOpGenRef.current !== roomOpGenRef.current) {
        console.log("[room-auto-call] cancel reason=op_stale");
        return;
      }

      const joinedKeyPrefix = `${identity.sessionId}:${identity.classId}:${identity.deviceId}:`;
      if (!(joinedSessionKeyRef.current ?? "").startsWith(joinedKeyPrefix)) {
        console.log("[room-auto-call] cancel reason=members_unstable");
        return;
      }

      const ids = autoCallMemberIdsRef.current;
      const viewerId = String(identity.deviceId).trim();
      const viewerJoined = ids.includes(viewerId);
      const peerJoined = ids.some((id) => id !== viewerId);
      if (ids.length < 2 || !viewerJoined || !peerJoined) {
        console.log("[room-auto-call] cancel reason=members_unstable");
        return;
      }

      const since = membersCount2SinceRef.current;
      const countStreak = membersCount2StreakRef.current;
      const stillStable =
        countStreak >= 2 ||
        (since !== null && Date.now() - since >= AUTO_CALL_MEMBERS_STABLE_MS);
      if (!stillStable || !presenceMapSeen2Ref.current) {
        console.log("[room-auto-call] cancel reason=members_unstable");
        return;
      }

      if (!consumeAutoCallOnce(identity.sessionId, identity.deviceId)) {
        console.log("[room-auto-call] skip reason=flag_missing|already_consumed");
        return;
      }

      autoCallAttemptedRef.current = true;
      console.log("[room-auto-call] allow reason=initial_match_stable");

      const callHref = withDev(
        `/call?sessionId=${encodeURIComponent(identity.sessionId)}&classId=${encodeURIComponent(
          identity.classId
        )}`
      );
      logNavigationIntent("room_auto_call", "RoomClient.auto_start");
      logRouteChange(getCurrentPath(), callHref, "room_auto_call");
      router.replace(callHref);
    }, AUTO_CALL_STABLE_DELAY_MS);

    return () => {
      // Keep timer across routine member/presence updates; session_changed cancels explicitly.
    };
  }, [
    sessionId,
    classId,
    deviceId,
    pathname,
    router,
    autojoin,
    openJoinedClass,
    err,
    visibleMembers,
    memberCount,
    status,
    pageVisible,
    autoCallRecheckTick,
    callBlockTick,
    cancelAutoCallTimer,
    roomSessionReady,
    sessionResolving,
  ]);

  useEffect(() => {
    return () => {
      if (autoCallTimerRef.current !== null) {
        window.clearTimeout(autoCallTimerRef.current);
        autoCallTimerRef.current = null;
      }
    };
  }, []);

  const subtitle = `${Math.min(Math.max(memberCount, 0), capacity)}/${capacity}人`;

  const shellTitle = topicTitle || "ルーム";
  const shellSubtitle = classLabel
    ? `${classLabel} / ${subtitle}`
    : subtitle;

    return (
    <>
      {showDevBanner && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: 28,
            background: "linear-gradient(90deg, #ef4444, #f59e0b)",
            color: "#fff",
            fontWeight: 900,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          🚧 DEV MODE {devBannerLabel}
        </div>
      )}

      <div style={{ paddingTop: showDevBanner ? 28 : 0 }}>
        <ChalkboardRoomShell
          title={shellTitle}
          subtitle={shellSubtitle}
          lines={
            err
              ? [err]
              : sessionResolving
                ? ["ルームを準備しています…"]
                : invite
                ? [
                    inviter
                      ? `${inviter}さんに招待されています`
                      : "このクラスに招待されています",
                    "参加中のメンバーと会話を始めましょう",
                  ]
                : autoCallAttemptedRef.current
                  ? ["通話開始ボタンを押して、通話を開始してください。"]
                  : status === "forming"
                    ? ["メンバーがそろうと、そのまま自然に通話へ進みます。"]
                    : status === "active"
                      ? ["通話を開始できます。"]
                      : []
          }
          onBack={() => router.push(withDev("/class/select"))}
          onHome={goHome}
          onStartCall={() => {
            const blockReason = isCallStartBlocked();
            if (blockReason) {
              console.log(`[room-call-start] blocked reason=${blockReason}`);
              return;
            }
            router.push(
              withDev(
                `/call?sessionId=${encodeURIComponent(
                  sessionId
                )}&classId=${encodeURIComponent(classId)}`
              )
            );
          }}
          startDisabled={
            !sessionId ||
            !classId ||
            sessionResolving ||
            !roomSessionReady ||
            Date.now() < recentRematchUntilRef.current
          }
          startLabel="通話開始"
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => router.push(profileEditHref)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                プロフィール編集
              </button>
            </div>

            {classId && deviceId ? (
              <MeetingPlanSection
                classId={classId}
                deviceId={deviceId}
                plan={meetingPlan}
                onUpdated={setMeetingPlan}
              />
            ) : null}

            {classId && deviceId ? (
              <CallRequestSection
                classId={classId}
                deviceId={deviceId}
                request={callRequest}
                showCreateButton={false}
                compact
                onUpdated={setCallRequest}
              />
            ) : null}

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                background: "#fff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <HelpTip
                label="招待リンクについて"
                content="この待機ルームに直接参加できるリンクをコピーします。"
              >
                <div style={{ fontWeight: 900 }}>友達を招待</div>
              </HelpTip>

              <button
                onClick={async () => {
                  if (!sessionId || !classId) {
                    alert("まだ招待リンクを作れません。");
                    return;
                  }

                  const inviterName = normalizeName(displayName) || "友達";

                  const inviteUrl =
                    `${location.origin}/room?invite=1&autojoin=1` +
                    `&sessionId=${encodeURIComponent(sessionId)}` +
                    `&classId=${encodeURIComponent(classId)}` +
                    `&inviter=${encodeURIComponent(inviterName)}`;

                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    alert("招待リンクをコピーしました");
                  } catch (e) {
                    console.warn("[invite] copy failed", e);
                    window.prompt(
                      "コピーできませんでした。下のリンクをコピーしてください。",
                      inviteUrl
                    );
                  }
                }}
                disabled={!sessionId || !classId}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 14px",
                  background: !sessionId || !classId ? "#9ca3af" : "#111827",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: !sessionId || !classId ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                招待リンクをコピー
              </button>
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                参加メンバー
              </div>

              {visibleMembers.length === 0 ? (
                <div style={{ color: "#6b7280" }}>まだ参加者はいません</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {visibleMembers.map((m) => {
                    const did = String(m.device_id ?? "").trim();
                    const isMe = did === String(deviceId ?? "").trim();

                    const label = isMe
                      ? resolveDisplayName({
                          profileDisplayName: displayName,
                          sessionMemberDisplayName: m.display_name,
                        }).displayName
                      : formatMemberDisplayName(m);

                    const prevStatuses = prevMemberStatusRef.current;
                    const memberDisplay = resolveRoomMemberDisplay(
                      m,
                      presenceMap[did],
                      sessionId,
                      prevStatuses[did] ?? null,
                      isMe,
                      deviceId,
                      lastInSessionAtRef.current[did] ?? Date.now(),
                      prevMemberInternalRef.current[did] ?? null
                    );
                    const pill = participationStatusStyle(memberDisplay.status);

                    return (
                      <div
                        key={did || "unknown"}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #e5e7eb",
                          background: "#fafafa",
                        }}
                      >
                        <button
                          type="button"
                          disabled={!did || !deviceId}
                          onClick={() => {
                            if (!did || !deviceId) return;
                            setProfileTarget({
                              deviceId: did,
                              viewerDeviceId: deviceId,
                              classId,
                              sessionId,
                              displayName: label,
                              photoPath: m.photo_path ?? null,
                            });
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            minWidth: 0,
                            flex: 1,
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <MemberAvatar
                            src={
                              m.avatar_url ||
                              (m.photo_path && publicStorageBase
                                ? `${publicStorageBase}/${m.photo_path}`
                                : null)
                            }
                            label={label}
                            isMe={isMe}
                          />

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 800,
                                color: "#111827",
                                lineHeight: 1.2,
                              }}
                            >
                              {label}
                            </div>
                          </div>
                        </button>

                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                          }}
                        >
                          {isMe ? (
                            <span style={{ fontSize: 12, color: "#6b7280" }}>
                              自分
                            </span>
                          ) : null}

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

                          {!isMe && did ? (
                            <details style={{ position: "relative" }}>
                              <summary
                                style={{
                                  listStyle: "none",
                                  cursor: "pointer",
                                  fontSize: 18,
                                  color: "#9ca3af",
                                  lineHeight: 1,
                                  width: 28,
                                  height: 28,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: 999,
                                }}
                              >
                                ︙
                              </summary>

                              <div
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: 32,
                                  zIndex: 20,
                                  padding: 8,
                                  borderRadius: 12,
                                  border: "1px solid #e5e7eb",
                                  background: "#fff",
                                  boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                                }}
                              >
                                <MemberModerationButtons
                                  myDeviceId={deviceId}
                                  targetDeviceId={did}
                                  targetName={label}
                                  sessionId={sessionId}
                                  classId={classId}
                                />
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <SessionMessages
              sessionId={sessionId}
              deviceId={deviceId}
              displayName={displayName}
              title="チャット"
              maxHeight={320}
            />
          </div>
        </ChalkboardRoomShell>
      </div>

      <MemberProfileModal
        target={profileTarget}
        onClose={() => setProfileTarget(null)}
        returnTo={buildCurrentPathReturnTo(pathname, searchParams.toString())}
      />
    </>
  );
}