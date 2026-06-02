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
import type { MeetingPlanPublic } from "@/lib/meetingPlanClient";
import type { CallRequestPublic } from "@/lib/callRequest";
import {
  hasLocalLeftCall,
  sanitizeLocalLeftCallAfterReload,
} from "@/lib/localCallExit";
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
  resolveParticipationStatus,
  type ParticipationSource,
  type UiParticipationStatus,
} from "@/lib/memberPresenceStatus";

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
}) {
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

  return { rematchRes, rematchJson };
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

function resolveRoomMemberParticipation(
  member: MemberRow,
  presence: PresenceRow | undefined,
  sessionId: string,
  previous: UiParticipationStatus | null,
  fetchFailed = false,
  localExitedCall = false
): UiParticipationStatus {
  return resolveParticipationStatus({
    source: mergeRoomMemberPresenceSource(member, presence),
    currentSessionId: sessionId,
    freshMs: PRESENCE_FRESH_MS_ROOM,
    previous,
    fetchFailed,
    localExitedCall,
  });
}

function resolveRoomMemberDisplay(
  member: MemberRow,
  presence: PresenceRow | undefined,
  sessionId: string,
  previous: UiParticipationStatus | null,
  isMe: boolean,
  viewerDeviceId: string
) {
  const did = String(member.device_id ?? "").trim();
  const viewerId = String(viewerDeviceId ?? "").trim();
  const viewerLeftCall =
    !!viewerId && !!sessionId && hasLocalLeftCall(sessionId, viewerId);
  const localExitedCall =
    hasLocalLeftCall(sessionId, did) || (isMe && viewerLeftCall);

  if (isMe || localExitedCall) {
    return {
      status: "waiting" as const,
      label: "待機中",
      used: isMe ? "self_in_room" : "local_exited_call",
      reason: localExitedCall ? "localExitedCall" : "self_in_room",
    };
  }

  const status = resolveRoomMemberParticipation(
    member,
    presence,
    sessionId,
    previous,
    false,
    localExitedCall
  );

  const screen = String(member.screen ?? presence?.screen ?? "").trim();
  const used = localExitedCall
    ? "local_exited_call"
    : member.is_in_call
      ? "is_in_call"
      : screen === "room"
        ? "screen_room"
        : presence
          ? "presence"
          : "member_fields";

  return {
    status,
    label: participationStatusLabel(status, "room"),
    used,
    reason:
      screen === "room"
        ? "screen_room"
        : member.is_in_call
          ? "is_in_call"
          : status,
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
      onError={(e) => {
        if (e.currentTarget.src.includes("default-avatar")) return;
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
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceRow>>({});
  const [topicTitle, setTopicTitle] = useState("ルーム");
  const [classLabel, setClassLabel] = useState("");
  const [err, setErr] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [status, setStatus] = useState("forming");
  const [capacity, setCapacity] = useState(5);

  const [deviceId, setDeviceId] = useState("");
  const [displayName, setDisplayName] = useState("");

  const joinedSessionKeyRef = useRef<string | null>(null);
  const autoMovedRef = useRef<string | null>(null);

  const [showDevBanner, setShowDevBanner] = useState(false);
  const [devBannerLabel, setDevBannerLabel] = useState("");

  const statusFailCountRef = useRef(0);
  const prevMemberStatusRef = useRef<Record<string, UiParticipationStatus>>({});
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
    const id = String(getDeviceId() ?? "").trim();
    setDeviceId(id);
  }, [dev]);

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

    void loadMeetingPlan();
    const timer = window.setInterval(loadMeetingPlan, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
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

    void loadCallRequest();
    const timer = window.setInterval(loadCallRequest, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
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

    for (const member of visibleMembers) {
      const did = String(member.device_id ?? "").trim();
      if (!did) continue;

      const isMe = did === String(deviceId ?? "").trim();
      const display = resolveRoomMemberDisplay(
        member,
        presenceMap[did],
        sessionId,
        prevMemberStatusRef.current[did] ?? null,
        isMe,
        deviceId
      );

      nextStatuses[did] = display.status;

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

    prevMemberStatusRef.current = nextStatuses;
  }, [visibleMembers, presenceMap, sessionId, deviceId]);

  const fetchStatus = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!sessionId || !classId) return;
      if (pathname !== "/room") return;
      if (!opts?.force && typeof document !== "undefined" && document.hidden) {
        return;
      }

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);

      try {
        const qs = new URLSearchParams({ sessionId, classId });

        const res = await fetch(`/api/session/status?${qs.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const rawText = await res.text().catch(() => "");
        let json: SessionStatusResponse | null = null;

        try {
  json = rawText ? (JSON.parse(rawText) as SessionStatusResponse) : null;
} catch {
  json = null;
}


if (!res.ok || !json?.ok) {
          setSoftConnectionError("status");
          return;
        }

        const incomingMembers = (Array.isArray(json.members) ? json.members : []).map(
          (member) => applyRoomLocalLeftOverride(member, sessionId)
        );

const stillJoined = incomingMembers.some(
  (m) => String(m.device_id ?? "").trim() === String(deviceId).trim()
);

if (deviceId && !stillJoined) {
  setErr("このクラスから退出済みです。");
  router.replace(withDev("/"));
  return;
}

setMembers((prev) => {
  const prevNorm = JSON.stringify(normalizeMemberCompare(prev));
  const nextNorm = JSON.stringify(normalizeMemberCompare(incomingMembers));
  if (prevNorm === nextNorm) return prev;
  logMemberDisplayNamesFromApi("room:session/status", incomingMembers);
  return incomingMembers;
});

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
    [sessionId, classId, pathname, topicTitle, deviceId, router]
  );

  useEffect(() => {
    if (!classId || !sessionId || !deviceId) return;
    if (pathname !== "/room") return;

    async function sendPresence() {
      await fetch("/api/class/presence", {
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
        console.warn("[room] presence heartbeat failed", e);
      });
    }

    void sendPresence();

    const timer = window.setInterval(() => {
      if (window.location.pathname !== "/room") return;
      void sendPresence();
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, [classId, sessionId, deviceId, pathname]);

  useEffect(() => {
    if (!classId) return;
    if (pathname !== "/room") return;

    let cancelled = false;

    async function loadPresence(opts?: { force?: boolean }) {
      if (!classId) return;
      if (pathname !== "/room") return;
      if (!opts?.force && typeof document !== "undefined" && document.hidden) {
        return;
      }

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
        if (!json?.ok) return;

        const list = Array.isArray(json?.presence) ? json.presence : [];
        const nextMap: Record<string, PresenceRow> = {};

        for (const row of list) {
          const mapped = mapPresenceApiRow(
            row as Record<string, unknown>,
            sessionId
          );
          if (!mapped) continue;
          nextMap[mapped.device_id] = mapped;
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
  }, [classId, sessionId, pathname]);

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

  if (sessionId) {
    void fetchStatus({ force: true });
  }

  return;
}

  if (!displayName) return; // ←これ追加（最重要）

const rawName = displayName;
const name = rawName === "You" ? "参加者" : rawName;

  const joinKey = `${sessionId}:${classId}:${deviceId}:${name}`;

  if (joinedSessionKeyRef.current === joinKey) {
  console.log("[room join] skip duplicate");
  return;
}

  let cancelled = false;


  async function join() {
  try {
    if (invite) {
      console.log("[invite] join-by-invite start", {
        classId,
        sessionId,
        deviceId,
      });

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
  console.warn("[room invite] class join failed", inviteJson);

  if (inviteJson?.error === "class_slots_limit") {
    throw new Error("参加できるクラス数の上限に達しています");
  }

  throw new Error("招待されたクラスへの参加に失敗しました");
}

      console.log("[invite] join-by-invite success", {
        classId,
        sessionId,
        deviceId,
        alreadyJoined: inviteJson?.alreadyJoined === true,
      });
      markJoinedClassesStale(classId);
    }

    console.log("[room join] request", {
      urlSessionId: sessionId,
      classId,
      deviceId,
      openJoinedClass,
    });

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

        if (error === "session_full") {
          throw new Error("このクラスは満員です");
        }

        if (error === "session_not_found") {
          throw new Error("ルームが見つかりません");
        }

        if (error === "session_closed" || error === "recruitment_closed") {
  const { rematchRes, rematchJson } = await rematchRoomSession({
    deviceId,
    classId,
    openJoinedClassId: classId,
  });

  const nextSessionId = String(
    rematchJson?.sessionId ?? rematchJson?.session_id ?? ""
  ).trim();

  const nextClassId = String(
    rematchJson?.classId ?? rematchJson?.class_id ?? classId
  ).trim();

  const nextSessionStatus = String(
    rematchJson?.sessionStatus ?? rematchJson?.session_status ?? ""
  ).trim();

  if (rematchRes.ok && rematchJson?.ok && nextSessionId && nextClassId) {
    console.log("[room join] rematch redirect", {
      fromSessionId: sessionId,
      toSessionId: nextSessionId,
      sessionStatus: nextSessionStatus,
    });

    router.replace(
      withDev(
        `/room?autojoin=1&classId=${encodeURIComponent(nextClassId)}` +
          `&sessionId=${encodeURIComponent(nextSessionId)}`
      )
    );
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

      if (cancelled) return;

      console.log("[room join] response", {
        ok: json?.ok,
        sessionId: json?.sessionId,
        status: json?.status,
        urlSessionId: sessionId,
      });

      // ✅ 成功した後だけ固定する
joinedSessionKeyRef.current = joinKey;

// ✅ DB反映遅延対策（自分だけ先に表示）
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
await fetchStatus({ force: true });
    } catch (e: any) {
      if (cancelled) return;

      // ✅ 失敗時は再試行できるように固定しない
      joinedSessionKeyRef.current = null;

      setErr(e?.message ?? "参加に失敗しました");
    }
  }

  void join();

  return () => {
    cancelled = true;
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
]);

  useEffect(() => {
    if (!sessionId || !classId) return;
    if (pathname !== "/room") return;

    void fetchStatus({ force: true });

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
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId, classId, pathname, fetchStatus]);

  useEffect(() => {
    if (!sessionId || !classId) return;
    if (pathname !== "/room") return;

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
  }, [sessionId, classId, pathname, fetchStatus]);

  useEffect(() => {
    if (!sessionId || !classId) return;
    if (pathname !== "/room") return;
    if (!autojoin) return;

    const selfJoined = visibleMembers.some(
  (m) => String(m.device_id ?? "").trim() === String(deviceId ?? "").trim()
);

const shouldAutoStart =
  !err &&
  selfJoined &&
  (status === "active" || memberCount >= 2);

if (!shouldAutoStart) return;
    const moveKey = `${sessionId}:${classId}:first-auto-call`;
    if (autoMovedRef.current === moveKey) return;

    if (typeof window !== "undefined") {
      const storageKey = `classmate_auto_call_moved:${moveKey}`;

      if (sessionStorage.getItem(storageKey) === "1") {
        return;
      }

      sessionStorage.setItem(storageKey, "1");
    }

    autoMovedRef.current = moveKey;

    const callHref = withDev(
      `/call?sessionId=${encodeURIComponent(sessionId)}&classId=${encodeURIComponent(
        classId
      )}`
    );
    logNavigationIntent("room_auto_call", "RoomClient.auto_start");
    logRouteChange(getCurrentPath(), callHref, "room_auto_call");
    router.replace(callHref);
  }, [
    status,
    memberCount,
    sessionId,
    classId,
    pathname,
    router,
    autojoin,
  ]);

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
              : invite
                ? [
                    inviter
                      ? `${inviter}さんに招待されています`
                      : "このクラスに招待されています",
                    "参加中のメンバーと会話を始めましょう",
                  ]
                : autoMovedRef.current ===
                    `${sessionId}:${classId}:first-auto-call` ||
                  (typeof window !== "undefined" &&
                    sessionStorage.getItem(
                      `classmate_auto_call_moved:${sessionId}:${classId}:first-auto-call`
                    ) === "1")
                  ? ["通話開始ボタンを押して、通話を開始してください。"]
                  : status === "forming"
                    ? ["メンバーがそろうと、そのまま自然に通話へ進みます。"]
                    : status === "active"
                      ? ["通話を開始できます。"]
                      : []
          }
          onBack={() => router.push(withDev("/class/select"))}
          onStartCall={() =>
            router.push(
              withDev(
                `/call?sessionId=${encodeURIComponent(
                  sessionId
                )}&classId=${encodeURIComponent(classId)}`
              )
            )
          }
          startDisabled={!sessionId || !classId}
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
              <div>
                <div style={{ fontWeight: 900 }}>友達を招待</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  この待機ルームに直接参加できるリンクをコピーします。
                </div>
              </div>

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
                      deviceId
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