"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChalkboardRoomShell } from "./ChalkboardRoomShell";
import { supabase } from "@/lib/supabaseClient";
import { getOrCreateDeviceId } from "@/lib/device";
import { pushRecentClass } from "@/lib/recentClasses";

type SessionStatusResult = {
  ok: boolean;
  session?: {
    id: string;
    topic: string;
    status: "forming" | "active" | "closed";
    capacity: number;
    created_at: string | null;
  };
  members?: { device_id?: string; display_name: string; joined_at: string }[];
  memberCount?: number;
  error?: string;
};

type SessionJoinResult = {
  ok?: boolean;
  sessionId?: string;
  status?: "forming" | "active" | "closed" | string;
  capacity?: number;
  memberCount?: number;
  topic?: string;
  error?: string;
};

type RoomMessage = {
  id: string;
  session_id: string;
  device_id: string;
  display_name: string;
  message: string;
  created_at: string;
};

function randomUuid(): string {
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readJsonBestEffort(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text), text };
  } catch {
    return { ok: res.ok, status: res.status, json: null as any, text };
  }
}

function Bubble({
  mine,
  name,
  text,
  time,
}: {
  mine: boolean;
  name: string;
  text: string;
  time: string;
}) {
  const bg = mine ? "#bff5a6" : "#ffffff";
  const border = mine ? "1px solid #7fdd6b" : "1px solid #e5e7eb";

  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "78%", display: "grid", gap: 4 }}>
        {!mine ? (
          <div style={{ fontSize: 11, fontWeight: 900, color: "#6b7280" }}>{name}</div>
        ) : null}

        <div
          style={{
            padding: "10px 12px",
            borderRadius: 16,
            border,
            background: bg,
            color: "#111",
            fontWeight: 800,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
        </div>

        <div
          style={{
            fontSize: 10,
            color: "#9ca3af",
            textAlign: mine ? "right" : "left",
            fontWeight: 800,
          }}
        >
          {time}
        </div>
      </div>
    </div>
  );
}

function getRecentLimit(): number {
  try {
    const plan = (localStorage.getItem("classmate_plan") || "free").toLowerCase();
    if (plan === "pro") return 20;
    if (plan === "plus" || plan === "premium") return 5;
  } catch {}
  return 1;
}

export default function RoomClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const classId = useMemo(() => {
    return (searchParams.get("classId") ?? "").trim();
  }, [searchParams]);

  const directSessionId = useMemo(() => {
    return (
      (searchParams.get("sessionId") ?? "").trim() ||
      (searchParams.get("session_id") ?? "").trim() ||
      (searchParams.get("session") ?? "").trim()
    );
  }, [searchParams]);

  const [resolvedSessionId, setResolvedSessionId] = useState("");
  const [status, setStatus] = useState<"forming" | "active" | "closed">("forming");
  const [capacity, setCapacity] = useState(5);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<
    { device_id?: string; display_name: string; joined_at: string }[]
  >([]);
  const [err, setErr] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");

  const deviceIdRef = useRef("");
  const displayNameRef = useRef("");
  const pollTimer = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const joinedRef = useRef(false);
  const currentSessionIdRef = useRef("");
  const currentClassIdRef = useRef("");

  const sessionId = resolvedSessionId || directSessionId;

  const scrollToBottom = (smooth: boolean) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
    try {
      displayNameRef.current =
        localStorage.getItem("classmate_display_name") ||
        localStorage.getItem("display_name") ||
        "You";
    } catch {
      displayNameRef.current = "You";
    }
  }, []);

  useEffect(() => {
    currentSessionIdRef.current = sessionId;
    currentClassIdRef.current = classId;
  }, [sessionId, classId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const deviceId = deviceIdRef.current || getOrCreateDeviceId();
      const sid = currentSessionIdRef.current;
      const cid = currentClassIdRef.current;

      if (sid) {
        navigator.sendBeacon(
          "/api/session/leave",
          new Blob([JSON.stringify({ sessionId: sid, deviceId })], {
            type: "application/json",
          })
        );
      }

      if (cid) {
        navigator.sendBeacon(
          "/api/class/leave",
          new Blob([JSON.stringify({ classId: cid, deviceId })], {
            type: "application/json",
          })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    setMsgs([]);
    setMembers([]);
    setMemberCount(0);
    setErr("");
    setTopicTitle("");
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const recentId = classId || sessionId;
    const roomUrl = classId
      ? `/room?autojoin=1&classId=${encodeURIComponent(classId)}`
      : `/room?sessionId=${encodeURIComponent(sessionId)}`;

    pushRecentClass(
      {
        id: recentId,
        title: topicTitle || "クラス",
        url: roomUrl,
      },
      getRecentLimit()
    );
  }, [sessionId, classId, topicTitle]);

  useEffect(() => {
    const name =
      localStorage.getItem("classmate_display_name") ||
      localStorage.getItem("display_name") ||
      "You";

    const deviceId = getOrCreateDeviceId();

    let cancelled = false;

    async function joinRoom() {
      if (joinedRef.current) return;
      if (!classId && !directSessionId) return;

      joinedRef.current = true;

      const body = classId
        ? { classId, name, deviceId, capacity: 5 }
        : { sessionId: directSessionId, name, deviceId, capacity: 5 };

      const res = await fetch("/api/session/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const r = await readJsonBestEffort(res);
      const j = (r.json ?? {}) as SessionJoinResult;

      if (!r.ok) {
        joinedRef.current = false;
        throw new Error(String(j?.error || r.text || "session_join_failed"));
      }

      const sid = String(j.sessionId ?? "").trim();
      if (!sid) {
        joinedRef.current = false;
        throw new Error("sessionId missing from join response");
      }

      if (cancelled) return;

      setResolvedSessionId(sid);
      setStatus((j.status as any) ?? "forming");
      setCapacity(Number.isFinite(Number(j.capacity)) && Number(j.capacity) > 0 ? Number(j.capacity) : 5);
      setMemberCount(Math.max(Number(j.memberCount ?? 0), 1));
      if (j.topic) setTopicTitle(String(j.topic).trim());


      if (classId) {
        const desired = `/room?autojoin=1&classId=${encodeURIComponent(classId)}&sessionId=${encodeURIComponent(
          sid
        )}`;
        const desiredSearch = desired.slice(desired.indexOf("?"));
        if (window.location.search !== desiredSearch) {
          router.replace(desired);
        }
      }
    }

    joinRoom().catch((e: any) => {
      if (!cancelled) setErr(e?.message ?? "session_join_failed");
    });

    return () => {
      cancelled = true;
    };
  }, [classId, directSessionId, router]);

  async function fetchStatus(sid: string, cid: string) {
    try {
      const qs = new URLSearchParams({ sessionId: sid });
      if (cid) qs.set("classId", cid);

      const res = await fetch(`/api/session/status?${qs.toString()}`, {
        cache: "no-store",
      });
      const r = await readJsonBestEffort(res);
      const j = (r.json ?? {}) as SessionStatusResult;

      if (!r.ok || !j.ok) {
        if (j?.error) setErr(String(j.error));
        return;
      }

      const mc = Number(j.memberCount ?? (j.members?.length ?? 0));
      const cap = Number(j.session?.capacity ?? 5);

      setStatus(j.session?.status ?? "forming");
      setCapacity(Number.isFinite(cap) && cap > 0 ? cap : 5);

      const incomingMembers = Array.isArray(j.members) ? j.members : [];
      const myDeviceId = deviceIdRef.current || getOrCreateDeviceId();
      const myName = displayNameRef.current || "You";
      const hasSelf = incomingMembers.some((m) => m.device_id === myDeviceId);

      setMembers(
        hasSelf
          ? incomingMembers
          : [
              ...incomingMembers,
              {
                device_id: myDeviceId,
                display_name: myName,
                joined_at: new Date().toISOString(),
              },
            ]
      );

      setMemberCount(Math.max(mc, 1));
      setErr("");

      const t = (j.session?.topic ?? "").trim();
      setTopicTitle(t || "");
    } catch (e: any) {
      setErr(e?.message ?? "status_failed");
    }
  }

  useEffect(() => {
    if (!sessionId) return;

    void fetchStatus(sessionId, classId);

    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(() => {
      void fetchStatus(sessionId, classId);
    }, 5000);

    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [sessionId, classId]);

  useEffect(() => {
    if (!sessionId) return;

    (async () => {
      const { data, error } = await supabase
        .from("room_messages")
        .select("id, session_id, device_id, display_name, message, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (error) {
        setErr(`メッセージ取得失敗: ${error.message}`);
        return;
      }

      setMsgs((data ?? []) as RoomMessage[]);
      queueMicrotask(() => scrollToBottom(false));
    })();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const ch = supabase
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
          setMsgs((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          queueMicrotask(() => scrollToBottom(true));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [sessionId]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !sessionId) return;

    const mineName = displayNameRef.current || "You";
    const mineId = deviceIdRef.current || getOrCreateDeviceId();
    const tempId = randomUuid();
    const nowIso = new Date().toISOString();

    setDraft("");
    setMsgs((prev) => [
      ...prev,
      {
        id: tempId,
        session_id: sessionId,
        device_id: mineId,
        display_name: mineName,
        message: text,
        created_at: nowIso,
      },
    ]);
    queueMicrotask(() => scrollToBottom(true));

    const { error } = await supabase.from("room_messages").insert({
      session_id: sessionId,
      device_id: mineId,
      display_name: mineName,
      message: text,
    });

    if (error) {
      setErr(`送信失敗: ${error.message}`);
      setMsgs((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
    }
  }

  async function handleExit() {
    const deviceId = deviceIdRef.current || getOrCreateDeviceId();

    try {
      if (sessionId) {
        await fetch("/api/session/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, deviceId }),
        });
      }

      if (classId) {
        await fetch("/api/class/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId, deviceId }),
        });
      }
    } catch (e) {
      console.error("leave failed", e);
    }

    router.push("/class/select");
  }

  const filled = Math.min(
    members.length > 0 ? members.length : Math.max(memberCount, 1),
    capacity
  );

  return (
    <ChalkboardRoomShell
      title={topicTitle || "読み込み中..."}
      subtitle={`参加人数 ${filled}/${capacity}`}
      onBack={() => {
        void handleExit();
      }}
      onStartCall={() =>
        router.push(
          `/call?sessionId=${encodeURIComponent(sessionId)}&returnTo=${encodeURIComponent(
            classId
              ? `/room?autojoin=1&classId=${encodeURIComponent(classId)}`
              : `/room?sessionId=${encodeURIComponent(sessionId)}`
          )}`
        )
      }
      startDisabled={!sessionId}
      startLabel={status === "active" ? "通話に戻る" : "通話を開始"}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div
          style={{
            borderRadius: 18,
            border: "1px solid #d9d9d9",
            background: "#fff",
            padding: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 900, color: "#111" }}>参加メンバー</div>

          {members.length === 0 ? (
            memberCount > 0 ? (
              <div style={{ color: "#6b7280", fontWeight: 700 }}>
                参加者を読み込み中です...
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontWeight: 700 }}>
                まだ参加者はいません
              </div>
            )
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {members.map((m, i) => (
                <div
                  key={`${m.device_id ?? m.display_name}-${m.joined_at}-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderRadius: 12,
                    border: "1px solid #ececec",
                    padding: "10px 12px",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#111" }}>
                    {m.display_name || "You"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
                    参加中
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
            状態: {status} / 定員 {capacity} / 参加 {filled}
          </div>

          {err ? (
            <div
              style={{
                borderRadius: 12,
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#be123c",
                padding: "10px 12px",
                fontWeight: 800,
              }}
            >
              {err}
            </div>
          ) : null}
        </div>

        <div
          style={{
            borderRadius: 18,
            border: "1px solid #d9d9d9",
            background: "#fff",
            padding: 14,
            display: "grid",
            gap: 10,
            minHeight: 320,
          }}
        >
          <div style={{ fontWeight: 900, color: "#111" }}>チャット</div>

          <div
            style={{
              display: "grid",
              gap: 10,
              alignContent: "start",
              minHeight: 180,
              maxHeight: 360,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {msgs.length === 0 ? (
              <div style={{ color: "#6b7280", fontWeight: 700 }}>
                まだメッセージはありません
              </div>
            ) : (
              msgs.map((m) => (
                <Bubble
                  key={m.id}
                  mine={m.device_id === deviceIdRef.current}
                  name={m.display_name || "You"}
                  text={m.message}
                  time={new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="メッセージを入力"
              style={{
                flex: 1,
                borderRadius: 14,
                border: "1px solid #d1d5db",
                padding: "12px 14px",
                fontSize: 14,
                fontWeight: 700,
                outline: "none",
              }}
            />
            <button
              onClick={() => void sendMessage()}
              style={{
                border: "none",
                borderRadius: 14,
                padding: "0 16px",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              送信
            </button>
          </div>
        </div>
      </div>
    </ChalkboardRoomShell>
  );
}