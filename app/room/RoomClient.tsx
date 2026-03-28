"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChalkboardRoomShell } from "./ChalkboardRoomShell";
import { supabase } from "@/lib/supabaseClient";
import { getOrCreateDeviceId } from "@/lib/device";
import { pushRecentClass } from "@/lib/recentClasses";

type MemberRow = {
  device_id?: string;
  display_name?: string;
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
          joined_at: joinedAt,
        };
      } else {
        const prevDid = String(me.device_id ?? "").trim();
        const prevJoinedAt = String(me.joined_at ?? "").trim();

        if (!prevDid && did) {
          me = {
            device_id: did,
            display_name: normalizedMyName || name || "",
            joined_at: joinedAt || prevJoinedAt,
          };
        } else if (!prevJoinedAt && joinedAt && me) {
  me = {
    device_id: me.device_id,
    display_name: me.display_name,
    joined_at: joinedAt,
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

async function readJsonBestEffort<T>(res: Response): Promise<T | null> {
  const text = await res.text().catch(() => "");
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export default function RoomClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const classId = (searchParams.get("classId") ?? "").trim();
  const sessionId =
    (searchParams.get("sessionId") ?? "").trim() ||
    (searchParams.get("session_id") ?? "").trim() ||
    (searchParams.get("session") ?? "").trim();

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [topicTitle, setTopicTitle] = useState("ルーム");
  const [err, setErr] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [status, setStatus] = useState("forming");
  const [capacity, setCapacity] = useState(5);

  const deviceIdRef = useRef("");
  const displayNameRef = useRef("");
  const joinedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileName() {
      const deviceId = deviceIdRef.current;
      if (!deviceId) return;

      try {
        const res = await fetch(
          `/api/profile?device_id=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );

        if (!res.ok) {
          if (!cancelled) {
            displayNameRef.current =
              localStorage.getItem("classmate_display_name") ||
              localStorage.getItem("display_name") ||
              "参加者";
          }
          return;
        }

        const json = (await res.json()) as ProfileResponse | null;
        const canonical =
          normalizeName(json?.display_name) ||
          localStorage.getItem("classmate_display_name") ||
          localStorage.getItem("display_name") ||
          "参加者";

        if (!cancelled) {
          displayNameRef.current = canonical;
          localStorage.setItem("classmate_display_name", canonical);
          localStorage.setItem("display_name", canonical);
        }
      } catch {
        if (!cancelled) {
          displayNameRef.current =
            localStorage.getItem("classmate_display_name") ||
            localStorage.getItem("display_name") ||
            "参加者";
        }
      }
    }

    void loadProfileName();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleMembers = useMemo(() => {
    return dedupeMembers(
      members,
      deviceIdRef.current,
      displayNameRef.current
    );
  }, [members]);

  useEffect(() => {
    if (!sessionId) {
      setErr("sessionId required");
      return;
    }

    const roomUrl = classId
      ? `/room?autojoin=1&classId=${encodeURIComponent(classId)}&sessionId=${encodeURIComponent(sessionId)}`
      : `/room?sessionId=${encodeURIComponent(sessionId)}`;

    pushRecentClass(
      {
        id: classId || sessionId,
        title: topicTitle || "ルーム",
        url: roomUrl,
      },
      20
    );
  }, [classId, sessionId, topicTitle]);

  useEffect(() => {
    if (!sessionId) return;
    if (!deviceIdRef.current) return;
    if (!displayNameRef.current) return;
    if (joinedSessionIdRef.current === sessionId) return;

    joinedSessionIdRef.current = sessionId;
    let cancelled = false;

    async function join() {
      const deviceId = deviceIdRef.current;
      const name = displayNameRef.current || "参加者";

      const res = await fetch("/api/session/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          deviceId,
          name,
          capacity: 5,
        }),
        cache: "no-store",
      });

      const json = await readJsonBestEffort<SessionJoinResponse>(res);

      if (!res.ok || !json?.ok) {
        joinedSessionIdRef.current = null;
        throw new Error(json?.error || "session_join_failed");
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
    }

    void join().catch((e: any) => {
      if (!cancelled) {
        setErr(e?.message ?? "session_join_failed");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId, topicTitle]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function fetchStatus() {
      const qs = new URLSearchParams({ sessionId });

      const res = await fetch(`/api/session/status?${qs.toString()}`, {
        cache: "no-store",
      });

      const json = await readJsonBestEffort<SessionStatusResponse>(res);

      if (!res.ok || !json?.ok) {
        if (!cancelled) {
          setErr(json?.error || "status_failed");
        }
        return;
      }

      if (cancelled) return;

      const incomingMembers = Array.isArray(json.members) ? json.members : [];
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
      setErr("");
    }

    void fetchStatus();

    const interval = window.setInterval(() => {
      void fetchStatus();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function loadMessages() {
      const { data, error } = await supabase
        .from("room_messages")
        .select("id, session_id, device_id, display_name, message, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;

      if (error) {
        setErr(`メッセージ取得失敗: ${error.message}`);
        return;
      }

      setMsgs(dedupeMessages((data ?? []) as RoomMessage[]));
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
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !sessionId) return;

    const deviceId = deviceIdRef.current;
    const name = displayNameRef.current || "参加者";

    const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

    const { error } = await supabase.from("room_messages").insert({
      session_id: sessionId,
      device_id: deviceId,
      display_name: name,
      message: text,
    });

    if (error) {
      setErr(`送信失敗: ${error.message}`);
      setMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(text);
      return;
    }

    // Realtime or pollingで本物が入るので optimistic 行は次回取得で自然に押し流される
  }

  const subtitle = `${Math.min(Math.max(memberCount, 0), capacity)}/${capacity}人 ・ ${status}`;

  return (
    <ChalkboardRoomShell
      title={topicTitle || "ルーム"}
      subtitle={subtitle}
      onBack={() => router.push("/class/select")}
      onStartCall={() =>
        router.push(`/call?sessionId=${encodeURIComponent(sessionId)}`)
      }
      startDisabled={!sessionId}
      startLabel="通話開始"
    >
      <div style={{ display: "grid", gap: 12 }}>
        {err ? (
          <div
            style={{
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              borderRadius: 12,
              padding: 10,
              fontWeight: 700,
            }}
          >
            {err}
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
                  String(m.device_id ?? "").trim() ===
                    String(deviceIdRef.current ?? "").trim() ||
                  (
                    !!displayNameRef.current &&
                    normalizeName(m.display_name) ===
                      normalizeName(displayNameRef.current)
                  );

                return (
                  <div
                    key={`${m.device_id ?? "noid"}-${m.joined_at ?? ""}-${i}`}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      background: "#fafafa",
                      fontWeight: 700,
                    }}
                  >
                    {isMe ? "You" : m.display_name || "参加者"}
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
            style={{
              display: "grid",
              gap: 8,
              minHeight: 160,
              maxHeight: 320,
              overflowY: "auto",
              marginBottom: 10,
            }}
          >
            {msgs.length === 0 ? (
              <div style={{ color: "#6b7280" }}>まだメッセージはありません</div>
            ) : (
              msgs.map((m) => {
                const isMe =
                  String(m.device_id ?? "").trim() ===
                  String(deviceIdRef.current ?? "").trim();

                return (
                  <div
                    key={m.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      background: isMe ? "#eff6ff" : "#fafafa",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                      {isMe ? "You" : m.display_name || "参加者"}
                    </div>
                    <div style={{ marginTop: 4 }}>{m.message}</div>
                  </div>
                );
              })
            )}
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
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            />

            <button
              onClick={() => void sendMessage()}
              style={{
                border: "none",
                borderRadius: 10,
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