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
  members?: { display_name: string; joined_at: string }[];
  memberCount?: number;
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

function shortId(id: string) {
  const s = (id || "").replace(/-/g, "");
  return s.length >= 6 ? s.slice(0, 6) : (id || "").slice(0, 6);
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

  const sessionId = useMemo(() => {
    const direct =
      (searchParams.get("sessionId") ?? "").trim() ||
      (searchParams.get("session_id") ?? "").trim() ||
      (searchParams.get("session") ?? "").trim();

    if (direct) return direct;

    // classId があるなら sessionId = classId に固定
    if (classId) return classId;

    return "";
  }, [searchParams, classId]);

  const [status, setStatus] = useState<"forming" | "active" | "closed">("forming");
  const [capacity, setCapacity] = useState(5);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<{ display_name: string; joined_at: string }[]>([]);
  const [err, setErr] = useState("");
  const [topicTitle, setTopicTitle] = useState<string>("");

  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");

  const deviceIdRef = useRef("");
  const displayNameRef = useRef("");
  const pollTimer = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
    if (!sessionId) return;

    const recentId = classId || sessionId;
    const roomUrl = classId
      ? `/room?autojoin=1&classId=${encodeURIComponent(classId)}`
      : `/room?sessionId=${encodeURIComponent(sessionId)}`;

    pushRecentClass(
      {
        id: recentId,
        title: `クラス ${shortId(recentId)}`,
        url: roomUrl,
      },
      getRecentLimit()
    );
  }, [sessionId, classId]);

  useEffect(() => {
    if (!sessionId) return;

    const name =
      localStorage.getItem("classmate_display_name") ||
      localStorage.getItem("display_name") ||
      "You";

    fetch("/api/session/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, classId, name }),
    }).catch(() => {});
  }, [sessionId, classId]);

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
      setMembers(j.members ?? []);
      setMemberCount(mc);
      setErr("");

      const t = (j.session?.topic ?? "").trim();
      if (t) setTopicTitle(t);
      else if (classId) setTopicTitle(`クラス ${shortId(classId)}`);
      else setTopicTitle("クラス");
    } catch (e: any) {
      setErr(e?.message ?? "status_failed");
    }
  }

  useEffect(() => {
    if (!sessionId) return;

    fetchStatus(sessionId, classId);

    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(() => fetchStatus(sessionId, classId), 5000);

    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [sessionId, classId]);

  useEffect(() => {
    if (!sessionId) return;
    if (!topicTitle) return;

    const recentId = classId || sessionId;
    const roomUrl = classId
      ? `/room?autojoin=1&classId=${encodeURIComponent(classId)}`
      : `/room?sessionId=${encodeURIComponent(sessionId)}`;

    pushRecentClass(
      {
        id: recentId,
        title: topicTitle,
        url: roomUrl,
      },
      getRecentLimit()
    );
  }, [sessionId, classId, topicTitle]);

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

      setMsgs((data ?? []) as any);
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
      supabase.removeChannel(ch);
    };
  }, [sessionId]);

  const filled = Math.min(members.length > 0 ? members.length : memberCount, capacity);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !sessionId) return;

    setDraft("");

    const optimisticId = randomUuid();
    const now = new Date().toISOString();

    setMsgs((prev) => [
      ...prev,
      {
        id: optimisticId,
        session_id: sessionId,
        device_id: deviceIdRef.current,
        display_name: displayNameRef.current || "You",
        message: text,
        created_at: now,
      },
    ]);
    queueMicrotask(() => scrollToBottom(true));

    const { error } = await supabase.from("room_messages").insert({
      id: optimisticId,
      session_id: sessionId,
      device_id: deviceIdRef.current,
      display_name: displayNameRef.current || "You",
      message: text,
    });

    if (error) setErr(`送信に失敗: ${error.message}`);
  }

  const goToCall = () => {
    if (!sessionId) return;

    const returnTo = classId
      ? `/room?autojoin=1&classId=${encodeURIComponent(classId)}`
      : `/room?sessionId=${encodeURIComponent(sessionId)}`;

    router.push(
      `/call?sessionId=${encodeURIComponent(sessionId)}&returnTo=${encodeURIComponent(returnTo)}`
    );
  };

  return (
    <ChalkboardRoomShell title="待機" subtitle={sessionId ? `セッション：${sessionId}` : undefined}>
      <div style={{ display: "grid", gap: 12 }}>
        {err ? (
          <div
            style={{
              padding: 10,
              border: "1px solid #f5c2c7",
              background: "#f8d7da",
              borderRadius: 10,
              color: "#842029",
            }}
          >
            <p style={{ margin: 0, fontWeight: 900 }}>エラー/警告</p>
            <p style={{ margin: "6px 0 0 0" }}>{err}</p>
          </div>
        ) : null}

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "#fff" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 900 }}>{topicTitle ? topicTitle : "クラス"}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                参加者：<b>{memberCount}</b> / {capacity} ・ 状態：
                {status === "active" ? "通話中" : status === "closed" ? "終了" : "待機"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                枠：<b>{filled}</b> / {capacity}
              </div>
            </div>

            <button
              onClick={goToCall}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "#111",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              通話へ
            </button>
          </div>

          <div
            style={{
              marginTop: 14,
              borderTop: "1px solid #eee",
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              minHeight: 420,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>メッセージ</div>

            <div
              style={{
                flex: 1,
                minHeight: 240,
                overflow: "auto",
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 10,
                display: "grid",
                gap: 10,
              }}
            >
              {msgs.map((m) => {
                const mine = m.device_id === deviceIdRef.current;
                const t = new Date(m.created_at);
                const time = `${String(t.getHours()).padStart(2, "0")}:${String(
                  t.getMinutes()
                ).padStart(2, "0")}`;
                return (
                  <Bubble
                    key={m.id}
                    mine={mine}
                    name={m.display_name}
                    text={m.message}
                    time={time}
                  />
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="メッセージを入力"
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  fontWeight: 800,
                  outline: "none",
                }}
              />
              <button
                onClick={sendMessage}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                  minWidth: 86,
                }}
              >
                送信
              </button>
            </div>
          </div>
        </div>
      </div>
    </ChalkboardRoomShell>
  );
}