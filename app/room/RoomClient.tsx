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
import { isDevMode, getDevUserKey } from "@/lib/devMode";

type MemberRow = {
  device_id?: string;
  display_name?: string;
  photo_path?: string | null;
  avatar_url?: string | null;
  joined_at?: string;
};

type PresenceStatus = "offline" | "waiting" | "active";

type PresenceRow = {
  device_id: string;
  status: PresenceStatus;
  session_id?: string | null;
  updated_at?: string | null;
};

type RoomMessage = {
  id: string;
  session_id: string;
  device_id: string;
  display_name: string;
  message: string;
  created_at: string;
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

function getFreshPresenceStatus(p?: PresenceRow): PresenceStatus {
  if (!p?.updated_at) return "offline";

  const t = new Date(p.updated_at).getTime();
  if (!Number.isFinite(t)) return "offline";

  if (Date.now() - t > 15_000) return "offline";

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

function dedupeMembers(
  list: MemberRow[],
  myDeviceId: string,
  myDisplayName: string
): MemberRow[] {
  const normalizedMyDeviceId = String(myDeviceId ?? "").trim();
  const normalizedMyName = normalizeName(myDisplayName);

  const others = new Map<string, MemberRow>();
  let me: MemberRow | null = null;

  for (const row of list) {
    const did = String(row.device_id ?? "").trim();
    const name = normalizeName(row.display_name);
    const photoPath =
      row.photo_path && String(row.photo_path).trim()
        ? String(row.photo_path).trim()
        : null;
    const avatarUrl =
      row.avatar_url && String(row.avatar_url).trim()
        ? String(row.avatar_url).trim()
        : null;
    const joinedAt = String(row.joined_at ?? "").trim();

    const isMeByDevice =
      !!did && !!normalizedMyDeviceId && did === normalizedMyDeviceId;

    if (isMeByDevice) {
      if (!me) {
        me = {
          device_id: did || normalizedMyDeviceId,
          display_name: name || normalizedMyName || "",
          photo_path: photoPath,
          avatar_url: avatarUrl,
          joined_at: joinedAt,
        };
      }
      continue;
    }

    if (!did) continue;
    if (!others.has(did)) {
      others.set(did, {
        device_id: did,
        display_name: name,
        photo_path: photoPath,
        avatar_url: avatarUrl,
        joined_at: joinedAt,
      });
    }
  }

  const sortedOthers = Array.from(others.values()).sort((a, b) =>
    String(a.joined_at ?? "").localeCompare(String(b.joined_at ?? ""))
  );

  return me ? [me, ...sortedOthers] : sortedOthers;
}

function dedupeMessages(list: RoomMessage[]): RoomMessage[] {
  const map = new Map<string, RoomMessage>();
  for (const m of list) {
    if (!m?.id) continue;
    map.set(m.id, m);
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
  );
}

function formatTime(v: string) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
        width: 42,
        height: 42,
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
  const dev = (searchParams.get("dev") ?? "").trim();
  const devSuffix = dev ? `&dev=${encodeURIComponent(dev)}` : "";
  const backToSelectUrl = dev
    ? `/class/select?dev=${encodeURIComponent(dev)}`
    : "/class/select";

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceRow>>({});
  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [topicTitle, setTopicTitle] = useState("ルーム");
  const [classLabel, setClassLabel] = useState("");
  const [err, setErr] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [status, setStatus] = useState("forming");
  const [capacity, setCapacity] = useState(5);

  const [deviceId, setDeviceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  const joinedSessionKeyRef = useRef<string | null>(null);
  const autoMovedRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesBoxRef = useRef<HTMLDivElement | null>(null);

  const [showDevBanner, setShowDevBanner] = useState(false);
  const [devBannerLabel, setDevBannerLabel] = useState("");

  const statusFailCountRef = useRef(0);
  const messagesFailCountRef = useRef(0);

  const publicStorageBase =
    process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-photos`
      : "";

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  function setSoftConnectionError(kind: "status" | "messages") {
    if (kind === "status") {
      statusFailCountRef.current += 1;
      if (statusFailCountRef.current >= 3) {
        setErr("接続が不安定です。再接続しています…");
      }
      return;
    }

    messagesFailCountRef.current += 1;
    if (messagesFailCountRef.current >= 3) {
      setErr("通信状況が不安定です。メッセージ更新を再試行しています…");
    }
  }

  function clearSoftConnectionError(kind?: "status" | "messages") {
    if (!kind || kind === "status") statusFailCountRef.current = 0;
    if (!kind || kind === "messages") messagesFailCountRef.current = 0;

    setErr((prev) => {
      if (
        prev === "接続が不安定です。再接続しています…" ||
        prev === "通信状況が不安定です。メッセージ更新を再試行しています…"
      ) {
        return "";
      }
      return prev;
    });
  }

  useEffect(() => {
    const id = String(getDeviceId() ?? "").trim();
    setDeviceId(id);
  }, []);

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

        const incomingMembers = Array.isArray(json.members) ? json.members : [];

        setMembers((prev) => {
          const prevNorm = JSON.stringify(normalizeMemberCompare(prev));
          const nextNorm = JSON.stringify(normalizeMemberCompare(incomingMembers));
          if (prevNorm === nextNorm) return prev;
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
    [sessionId, classId, pathname, topicTitle]
  );

  // ✅ 待機ルームにいる間、presence を waiting 扱いで送る
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
          sessionId: null,
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
    }, 5000);

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
          const did = String(row?.device_id ?? "").trim();
          if (!did) continue;
          nextMap[did] = row;
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
  }, [classId, pathname]);

  useEffect(() => {
    if (!sessionId) {
      setErr("sessionId required");
      return;
    }

    if (!classId) {
      setErr("classId required");
      return;
    }

    const roomUrl =
      `/room?autojoin=1&classId=${encodeURIComponent(classId)}` +
      `&sessionId=${encodeURIComponent(sessionId)}` +
      devSuffix;

    pushRecentClass(
      {
        id: classId || sessionId,
        title: topicTitle || classLabel || "ルーム",
        url: roomUrl,
      },
      20
    );
  }, [classId, sessionId, topicTitle, classLabel, devSuffix]);

  useEffect(() => {
    joinedSessionKeyRef.current = null;
    autoMovedRef.current = null;
  }, [sessionId, deviceId]);

  useEffect(() => {
    if (!sessionId || !classId || !deviceId || !displayName) return;
    if (pathname !== "/room") return;

    const joinKey = `${sessionId}:${deviceId}`;
    if (joinedSessionKeyRef.current === joinKey) return;

    joinedSessionKeyRef.current = joinKey;
    let cancelled = false;

    async function join() {
      const rawName = displayName || "参加者";
      const name = rawName === "You" ? "参加者" : rawName;

      const res = await fetch("/api/session/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          classId,
          deviceId,
          name,
          capacity: 5,
        }),
        cache: "no-store",
      });

      const rawText = await res.text().catch(() => "");
      let json: SessionJoinResponse | null = null;

      try {
        json = rawText ? (JSON.parse(rawText) as SessionJoinResponse) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        joinedSessionKeyRef.current = null;
        throw new Error(json?.error || rawText || "session_join_failed");
      }

      if (cancelled) return;

      if (!topicTitle && json.topic) setTopicTitle(String(json.topic).trim());
      if (json.status) setStatus(String(json.status));
      if (Number.isFinite(Number(json.capacity)) && Number(json.capacity) > 0) {
        setCapacity(Number(json.capacity));
      }
      if (Number.isFinite(Number(json.memberCount))) {
        setMemberCount(Number(json.memberCount));
      }

      setErr("");
      await fetchStatus({ force: true });
    }

    void join().catch((e: any) => {
      if (!cancelled) setErr(e?.message ?? "session_join_failed");
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId, classId, deviceId, displayName, pathname, fetchStatus, topicTitle]);

  useEffect(() => {
    if (!sessionId || !classId) return;
    if (pathname !== "/room") return;

    void fetchStatus({ force: true });

    const interval = window.setInterval(() => {
      if (window.location.pathname !== "/room") return;
      void fetchStatus();
    }, 5000);

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

  const shouldAutoStart = status === "active" || memberCount >= 2;
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

  router.replace(
    `/call?sessionId=${encodeURIComponent(sessionId)}&classId=${encodeURIComponent(
      classId
    )}${devSuffix}`
  );
}, [
  status,
  memberCount,
  sessionId,
  classId,
  pathname,
  router,
  devSuffix,
  autojoin,
]);

  useEffect(() => {
    if (!sessionId) return;
    if (pathname !== "/room") return;

    let cancelled = false;

    async function loadMessages() {
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const { data, error } = await supabase
          .from("room_messages")
          .select("id, session_id, device_id, display_name, message, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .limit(200);

        if (cancelled) return;

        if (error) {
          setSoftConnectionError("messages");
          return;
        }

        setMsgs((prev) => {
          const next = dedupeMessages((data ?? []) as RoomMessage[]);
          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(next);
          if (prevStr === nextStr) return prev;
          return next;
        });

        clearSoftConnectionError("messages");
      } catch {
        if (!cancelled) setSoftConnectionError("messages");
      }
    }

    void loadMessages();

    const poll = window.setInterval(() => {
      if (window.location.pathname !== "/room") return;
      void loadMessages();
    }, 5000);

    const onVisible = () => {
      if (document.hidden) return;
      void loadMessages();
    };

    document.addEventListener("visibilitychange", onVisible);

    const channel = supabase
      .channel(`room_messages:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: any) => {
          if (window.location.pathname !== "/room") return;

          const row = payload?.new as RoomMessage;
          if (!row?.id) return;

          setMsgs((prev) => dedupeMessages([...prev, row]));
          clearSoftConnectionError("messages");
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, pathname]);

  useEffect(() => {
    const box = messagesBoxRef.current;
    if (!box) return;

    const nearBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight < 120;

    if (nearBottom) scrollToBottom("smooth");
  }, [msgs]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !sessionId) return;

    const rawName = displayName || "参加者";
    const name = rawName === "You" ? "参加者" : rawName;

    const optimisticId = `local-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const optimisticRow: RoomMessage = {
      id: optimisticId,
      session_id: sessionId,
      device_id: deviceId,
      display_name: name,
      message: text,
      created_at: new Date().toISOString(),
    };

    setMsgs((prev) => dedupeMessages([...prev, optimisticRow]));
    setDraft("");
    queueMicrotask(() => scrollToBottom("smooth"));

    const { error } = await supabase.from("room_messages").insert({
      session_id: sessionId,
      device_id: deviceId,
      display_name: name,
      message: text,
    });

    if (error) {
      setErr("送信に失敗しました。通信状況をご確認ください。");
      setMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(text);
    }
  }

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
    : autoMovedRef.current === `${sessionId}:${classId}:first-auto-call` ||
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
          onBack={() => router.push(backToSelectUrl)}
          onStartCall={() =>
            router.push(
              `/call?sessionId=${encodeURIComponent(sessionId)}&classId=${encodeURIComponent(classId)}${devSuffix}`
            )
          }
          startDisabled={!sessionId || !classId}
          startLabel="通話開始"
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>参加メンバー</div>

              {visibleMembers.length === 0 ? (
                <div style={{ color: "#6b7280" }}>まだ参加者はいません</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {visibleMembers.map((m) => {
                    const did = String(m.device_id ?? "").trim();
                    const isMe = did === String(deviceId ?? "").trim();

                    const label = isMe
                      ? normalizeName(displayName) ||
                        normalizeName(m.display_name) ||
                        "参加者"
                      : normalizeName(m.display_name) || "参加者";

                    const memberStatus = isMe
                      ? "waiting"
                      : getFreshPresenceStatus(presenceMap[did]);

                    const pill = statusStyle(memberStatus);

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

                          <div
                            style={{
                              marginTop: 4,
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            {isMe ? (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#6b7280",
                                }}
                              >
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
                              {statusLabel(memberStatus)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>チャット</div>

              <div
                ref={messagesBoxRef}
                style={{
                  display: "grid",
                  gap: 10,
                  maxHeight: 320,
                  overflowY: "auto",
                  paddingRight: 4,
                  marginBottom: 12,
                }}
              >
                {msgs.length === 0 ? (
                  <div style={{ color: "#666", fontSize: 13 }}>
                    まだメッセージはありません
                  </div>
                ) : (
                  msgs.map((m) => {
                    const isMe =
                      String(m.device_id ?? "").trim() ===
                      String(deviceId ?? "").trim();

                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          justifyContent: isMe ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "78%",
                            display: "grid",
                            gap: 4,
                            justifyItems: isMe ? "end" : "start",
                          }}
                        >
                          {!isMe ? (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#6b7280",
                                fontWeight: 800,
                                paddingLeft: 4,
                              }}
                            >
                              {m.display_name || "参加者"}
                            </div>
                          ) : null}

                          <div
                            style={{
                              padding: "10px 12px",
                              borderRadius: 18,
                              background: isMe ? "#86efac" : "#ffffff",
                              border: isMe ? "none" : "1px solid #e5e7eb",
                              color: "#111827",
                              lineHeight: 1.5,
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                              borderBottomRightRadius: isMe ? 6 : 18,
                              borderBottomLeftRadius: isMe ? 18 : 6,
                              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                            }}
                          >
                            {m.message}
                          </div>

                          <div
                            style={{
                              fontSize: 10,
                              color: "#9ca3af",
                              padding: isMe ? "0 4px 0 0" : "0 0 0 4px",
                            }}
                          >
                            {formatTime(m.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => {
                    window.setTimeout(() => setIsComposing(false), 0);
                  }}
                  onKeyDown={(e) => {
                    const native = e.nativeEvent as KeyboardEvent & {
                      isComposing?: boolean;
                      keyCode?: number;
                    };

                    if (isComposing) return;
                    if (native?.isComposing) return;
                    if (e.key === "Process") return;
                    if (native?.keyCode === 229) return;

                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="メッセージを入力"
                  style={{
                    flex: 1,
                    border: "1px solid #d1d5db",
                    borderRadius: 999,
                    padding: "12px 14px",
                    background: "#fff",
                  }}
                />

                <button
                  onClick={() => void sendMessage()}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "10px 16px",
                    background: "#22c55e",
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  送信
                </button>
              </div>
            </div>
          </div>
        </ChalkboardRoomShell>
      </div>
    </>
  );
}