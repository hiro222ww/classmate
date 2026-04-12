"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChalkboardRoomShell } from "./ChalkboardRoomShell";
import { supabase } from "@/lib/supabaseClient";
import { getDeviceId } from "@/lib/device";
import { pushRecentClass } from "@/lib/recentClasses";
import { isDevMode, getDevUserKey } from "@/lib/devMode";

type MemberRow = {
  device_id?: string;
  display_name?: string;
  photo_path?: string | null;
  joined_at?: string;
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
  device_id?: string;
  display_name?: string;
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

function normalizeName(v: string | undefined) {
  return String(v ?? "").trim();
}

function getAvatarUrl(photoPath?: string | null) {
  let normalized = String(photoPath ?? "").trim();

  if (!normalized) return "/default-avatar.jpg";

  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  ) {
    return normalized;
  }

  if (normalized.startsWith("profile-photos/")) {
    normalized = normalized.replace(/^profile-photos\//, "");
  }

  if (normalized.startsWith("avatars/")) {
    normalized = normalized.replace(/^avatars\//, "");
  }

  const { data } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(normalized);

  const publicUrl = data?.publicUrl?.trim();
  if (!publicUrl) return "/default-avatar.jpg";

  return `${publicUrl}?v=${encodeURIComponent(normalized)}`;
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
  const { scoped, legacy } = getDisplayNameStorageKeys(deviceId);

  localStorage.setItem(scoped, normalizedName);
  localStorage.setItem(legacy, normalizedName);
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
    const photoPath: string | null =
      row.photo_path && String(row.photo_path).trim()
        ? String(row.photo_path).trim()
        : null;
    const joinedAt = String(row.joined_at ?? "").trim();

   const isMeByDevice =
  !!did && !!normalizedMyDeviceId && did === normalizedMyDeviceId;


    const isMeByName =
      !!name && !!normalizedMyName && name === normalizedMyName;

    if (isMeByDevice || isMeByName) {
      if (!me) {
        me = {
          device_id: did || normalizedMyDeviceId,
          display_name: normalizedMyName || name || "",
          photo_path: photoPath,
          joined_at: joinedAt,
        };
      } else {
        const prevDid = String(me.device_id ?? "").trim();
        const prevJoinedAt = String(me.joined_at ?? "").trim();
        const prevPhotoPath: string | null =
          me.photo_path && String(me.photo_path).trim()
            ? String(me.photo_path).trim()
            : null;

        if (!prevDid && did) {
          me = {
            device_id: did,
            display_name: normalizedMyName || name || "",
            photo_path: photoPath || prevPhotoPath,
            joined_at: joinedAt || prevJoinedAt,
          };
        } else if (!prevJoinedAt && joinedAt) {
          me = {
            device_id: me.device_id,
            display_name: me.display_name,
            photo_path: me.photo_path ?? photoPath,
            joined_at: joinedAt,
          };
        } else if (!prevPhotoPath && photoPath) {
          me = {
            device_id: me.device_id,
            display_name: me.display_name,
            photo_path: photoPath,
            joined_at: me.joined_at,
          };
        }
      }
      continue;
    }

    if (!did) continue;
    if (!others.has(did)) {
      others.set(did, {
        device_id: did,
        display_name: name,
        photo_path: photoPath,
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

export default function RoomClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const classId = (searchParams.get("classId") ?? "").trim();
  const sessionId =
    (searchParams.get("sessionId") ?? "").trim() ||
    (searchParams.get("session_id") ?? "").trim() ||
    (searchParams.get("session") ?? "").trim();
  const dev = (searchParams.get("dev") ?? "").trim();
  const devSuffix = dev ? `&dev=${encodeURIComponent(dev)}` : "";
  const backToSelectUrl = dev
    ? `/class/select?dev=${encodeURIComponent(dev)}`
    : "/class/select";

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [topicTitle, setTopicTitle] = useState("ルーム");
  const [err, setErr] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [status, setStatus] = useState("forming");
  const [capacity, setCapacity] = useState(5);

  const [deviceId, setDeviceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  const joinedSessionIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesBoxRef = useRef<HTMLDivElement | null>(null);

  const [showDevBanner, setShowDevBanner] = useState(false);
  const [devBannerLabel, setDevBannerLabel] = useState("");

  const statusFailCountRef = useRef(0);
  const messagesFailCountRef = useRef(0);

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
    if (!kind || kind === "status") {
      statusFailCountRef.current = 0;
    }
    if (!kind || kind === "messages") {
      messagesFailCountRef.current = 0;
    }

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
    const id = getDeviceId();
    setDeviceId(id);
  }, [dev]);

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

        if (!res.ok) {
          if (!cancelled) {
            const fallback = readStoredDisplayName(deviceId) || "参加者";
            const safeName = fallback === "You" ? "参加者" : fallback;
            setDisplayName(safeName);
          }
          return;
        }

        const data = (await res.json()) as ProfileResponse | null;
        const canonical =
          normalizeName(data?.display_name) ||
          readStoredDisplayName(deviceId) ||
          "参加者";

        if (!cancelled) {
          const safeName = canonical === "You" ? "参加者" : canonical;
          setDisplayName(safeName);
          writeStoredDisplayName(deviceId, safeName);
        }
      } catch {
        if (!cancelled) {
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
  }, [deviceId]);

  const visibleMembers = useMemo(() => {
    return dedupeMembers(members, deviceId, displayName);
  }, [members, deviceId, displayName]);

  useEffect(() => {
    console.log("[room] visibleMembers", visibleMembers);
  }, [visibleMembers]);

  const fetchStatus = useCallback(async () => {
    if (!sessionId || !classId) return;

    try {
      const qs = new URLSearchParams({ sessionId, classId });

      const res = await fetch(`/api/session/status?${qs.toString()}`, {
        cache: "no-store",
      });

      const rawText = await res.text().catch(() => "");
      let json: SessionStatusResponse | null = null;

      try {
        json = rawText ? (JSON.parse(rawText) as SessionStatusResponse) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        console.error("[room] status fetch failed", {
          url: `/api/session/status?${qs.toString()}`,
          status: res.status,
          statusText: res.statusText,
          json,
          rawText,
          sessionId,
          classId,
        });
        setSoftConnectionError("status");
        return;
      }

      const incomingMembers = Array.isArray(json.members) ? json.members : [];
      console.log("[members raw]", incomingMembers);
      setMembers(incomingMembers);

      if (json.session?.topic) {
        setTopicTitle(String(json.session.topic).trim() || "ルーム");
      }
      if (json.session?.status) {
        setStatus(String(json.session.status));
      }
      if (Number.isFinite(Number(json.session?.capacity))) {
        setCapacity(Number(json.session?.capacity));
      }

      const nextCount = Number(json.memberCount ?? incomingMembers.length ?? 0);
      setMemberCount(Math.max(nextCount, 0));
      clearSoftConnectionError("status");
    } catch (e) {
      console.error("[room] status fetch exception", e);
      setSoftConnectionError("status");
    }
  }, [sessionId, classId]);

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
        title: topicTitle || "ルーム",
        url: roomUrl,
      },
      20
    );
  }, [classId, sessionId, topicTitle, devSuffix]);

  useEffect(() => {
    joinedSessionIdRef.current = null;
  }, [sessionId, deviceId]);

  useEffect(() => {
    if (!sessionId) return;
    if (!classId) return;
    if (!deviceId) return;
    if (!displayName) return;
    if (joinedSessionIdRef.current === sessionId) return;

    joinedSessionIdRef.current = sessionId;
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
        joinedSessionIdRef.current = null;
        throw new Error(json?.error || rawText || "session_join_failed");
      }

      if (cancelled) return;

      if (json.topic) setTopicTitle(String(json.topic).trim());
      if (json.status) setStatus(String(json.status));
      if (Number.isFinite(Number(json.capacity)) && Number(json.capacity) > 0) {
        setCapacity(Number(json.capacity));
      }
      if (Number.isFinite(Number(json.memberCount))) {
        setMemberCount(Number(json.memberCount));
      }

      setErr("");
      await fetchStatus();
    }

    void join().catch((e: any) => {
      if (!cancelled) {
        setErr(e?.message ?? "session_join_failed");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId, classId, deviceId, displayName, fetchStatus]);

  useEffect(() => {
    if (!sessionId || !classId) return;

    void fetchStatus();

    const interval = window.setInterval(() => {
      void fetchStatus();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [sessionId, classId, fetchStatus]);

  useEffect(() => {
    if (!sessionId) return;

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
          await fetchStatus();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, fetchStatus]);

  useEffect(() => {
    const channel = supabase
      .channel(`room-user-profiles-${sessionId || "no-session"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_profiles",
        },
        async () => {
          await fetchStatus();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, fetchStatus]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function loadMessages() {
      try {
        const { data, error } = await supabase
          .from("room_messages")
          .select("id, session_id, device_id, display_name, message, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .limit(200);

        if (cancelled) return;

        if (error) {
          const message =
            typeof error?.message === "string" ? error.message : "no_message";
          const details =
            typeof error?.details === "string" ? error.details : "no_details";
          const hint =
            typeof error?.hint === "string" ? error.hint : "no_hint";
          const code =
            typeof error?.code === "string" ? error.code : "no_code";

          console.log("[room] messages fetch failed message =", message);
          console.log("[room] messages fetch failed details =", details);
          console.log("[room] messages fetch failed hint =", hint);
          console.log("[room] messages fetch failed code =", code);
          console.log("[room] messages fetch failed sessionId =", sessionId);

          setSoftConnectionError("messages");
          return;
        }

        setMsgs(dedupeMessages((data ?? []) as RoomMessage[]));
        clearSoftConnectionError("messages");
      } catch (e) {
        if (!cancelled) {
          console.error("[room] messages fetch exception", e);
          setSoftConnectionError("messages");
        }
      }
    }

    void loadMessages();

    const poll = window.setInterval(() => {
      void loadMessages();
    }, 2000);

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
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    const box = messagesBoxRef.current;
    if (!box) return;

    const nearBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight < 120;

    if (nearBottom) {
      scrollToBottom("smooth");
    }
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
      console.error("[room] message send failed", error);
      setErr("送信に失敗しました。通信状況をご確認ください。");
      setMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(text);
      return;
    }
  }

  const subtitle = `${Math.min(Math.max(memberCount, 0), capacity)}/${capacity}人 ・ ${status}`;

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
          title={topicTitle || "ルーム"}
          subtitle={subtitle}
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
            {err ? (
              <div
                style={{
                  border: "1px solid #fde68a",
                  background: "#fffbeb",
                  color: "#92400e",
                  borderRadius: 12,
                  padding: 10,
                  fontWeight: 700,
                }}
              >
                {err}
              </div>
            ) : status === "forming" ? (
              <div
                style={{
                  border: "1px solid #bfdbfe",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  borderRadius: 12,
                  padding: 10,
                  fontWeight: 700,
                }}
              >
                メンバーがそろうと、そのまま自然に通話へ進みます。
              </div>
            ) : null}

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
                  {visibleMembers.map((m, i) => {
                    const isMe =
  String(m.device_id ?? "").trim() === String(deviceId ?? "").trim();

                    const label = isMe ? "You" : m.display_name || "参加者";
                    const avatarUrl = getAvatarUrl(m.photo_path);

                    return (
                      <div
                        key={`${m.device_id ?? "noid"}-${m.joined_at ?? ""}-${i}`}
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
                        <img
                          src={avatarUrl}
                          alt={label}
                          onLoad={() => {
                            console.log("[avatar ok]", {
                              label,
                              photo_path: m.photo_path,
                              avatarUrl,
                            });
                          }}
                          onError={(e) => {
                            console.log("[avatar ng]", {
                              label,
                              photo_path: m.photo_path,
                              avatarUrl,
                            });
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
                              fontSize: 12,
                              color: "#6b7280",
                            }}
                          >
                            {isMe ? "自分" : "参加中"}
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