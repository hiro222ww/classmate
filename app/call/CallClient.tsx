"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SharedCanvasBoard from "./SharedCanvasBoard";
import CallVoiceLayer from "./CallVoiceLayer";
import { supabase } from "@/lib/supabaseClient";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";
import SessionMessages from "@/components/SessionMessages";
import YouTubeWatchParty from "./YouTubeWatchParty";

type Member = {
  device_id: string;
  display_name: string;
  photo_path: string | null;
  lastSpokeAt?: number;
  is_in_call?: boolean;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";

type SessionStatusResponse = {
  ok?: boolean;
  session?: {
    id: string;
    class_id?: string;
    topic?: string;
    status?: "forming" | "active" | "closed";
    capacity?: number;
    created_at?: string | null;
  };
  members?: Array<{
    device_id?: string;
    display_name?: string | null;
    photo_path?: string | null;
    joined_at?: string | null;
    is_in_call?: boolean | null;
  }>;
  memberCount?: number;
  error?: string;
};

function getAvatarUrl(photoPath?: string | null) {
  let normalized = String(photoPath ?? "").trim();

  if (!normalized) return "/default-avatar.jpg";

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
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

export default function CallClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sessionId = searchParams.get("sessionId") || "";
  const classId = searchParams.get("classId") || "";

  const [deviceId] = useState(() => getDeviceId());

  const returnTo = useMemo(() => {
    return withDev("/class/select");
  }, []);

  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
  if (!deviceId) return;

  setMembers((prev) => {
    if (prev.length > 0) return prev;

    return [
      {
        device_id: deviceId,
        display_name: "参加者",
        photo_path: null,
      },
    ];
  });
}, [deviceId]);

  const [isMuted, setIsMuted] = useState(true);
  const [micReady, setMicReady] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [callInfo, setCallInfo] = useState("");
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});
  const [capacity, setCapacity] = useState(5);
  const [fetchErrorCount, setFetchErrorCount] = useState(0);

  const retryTimerRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const fetchMembers = useCallback(
    async (reason = "manual") => {
      if (!sessionId || !classId) {
  return;
}

      if (fetchingRef.current) {
        return;
      }

      fetchingRef.current = true;

      try {
        const qs = new URLSearchParams({
          sessionId,
          classId,
        });

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

        if (!res.ok) {
          console.error("[call] session status fetch http error", {
            reason,
            status: res.status,
            statusText: res.statusText,
            rawText,
          });
          throw new Error(`HTTP ${res.status}`);
        }

        if (!json) {
          console.warn("[call] session status non-json or empty response", {
            reason,
            rawText,
          });
          throw new Error("non_json_or_empty_response");
        }

        if (!json.ok) {
          console.warn("[call] session status api not ok", {
            reason,
            error: json.error || "session_status_failed",
            rawText,
          });
          throw new Error(json.error || "session_status_failed");
        }

        const incoming = Array.isArray(json.members) ? json.members : [];
        const nextMembers: Member[] = [];

        for (const m of incoming) {
          const did = String(m.device_id ?? "").trim();
          if (!did) continue;

          const existing = members.find((x) => x.device_id === did);

          nextMembers.push({
            device_id: did,
            display_name: String(m.display_name ?? "").trim() || "参加者",
            photo_path: String(m.photo_path ?? "").trim() || null,
            lastSpokeAt: existing?.lastSpokeAt,
            is_in_call: m.is_in_call === true,
          });
        }

        console.log("[call] fetchMembers success", {
          reason,
          count: nextMembers.length,
          members: nextMembers.map((m) => m.device_id),
        });

        const stillJoined = nextMembers.some(
          (m) => String(m.device_id ?? "").trim() === String(deviceId).trim()
        );

        if (deviceId && !stillJoined) {
          router.replace(withDev("/"));
          return;
        }

        setMembers(nextMembers);
        setFetchErrorCount(0);
        clearRetryTimer();

        if (Number.isFinite(Number(json.session?.capacity))) {
          setCapacity(Number(json.session?.capacity));
        }
      } catch (e: any) {
        const message = e?.message ?? "unknown_error";

        console.warn("[call] fetchMembers unexpected error", {
          reason,
          message,
        });

        setFetchErrorCount((prev) => prev + 1);

        clearRetryTimer();

        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          void fetchMembers("retry");
        }, 1200);
      } finally {
        fetchingRef.current = false;
      }
    },
    [sessionId, classId, deviceId, router, clearRetryTimer]
  );

  useEffect(() => {
    void fetchMembers("initial");

    return () => {
      clearRetryTimer();
    };
  }, [fetchMembers, clearRetryTimer]);

  useEffect(() => {
    console.log("[call] members state", {
      count: members.length,
      deviceId,
      members: members.map((m) => ({
        device_id: m.device_id,
        display_name: m.display_name,
        isMe: m.device_id === deviceId,
      })),
    });
  }, [members, deviceId]);

  useEffect(() => {
    if (!classId || !sessionId || !deviceId) return;

    async function sendPresence() {
      await fetch("/api/class/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          deviceId,
          screen: "call",
          sessionId,
        }),
        cache: "no-store",
      }).catch((e) => {
        console.warn("[call] presence heartbeat failed", e);
      });
    }

    void sendPresence();

    window.setTimeout(() => {
      void sendPresence();
      void fetchMembers("presence_after_join");
    }, 500);

    window.setTimeout(() => {
      void fetchMembers("presence_after_join_2");
    }, 1500);

    const timer = window.setInterval(() => {
      void sendPresence();
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, [classId, sessionId, deviceId, fetchMembers]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`call-members-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_members",
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
          await fetchMembers("session_members_realtime");
        }
      )
      .subscribe((status) => {
        console.log("[call] members subscribe status", {
          sessionId,
          status,
        });
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // 一旦コメントアウト
/*
useEffect(() => {
  if (!sessionId) return;

  const channel = supabase
    .channel(`call-profiles-${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_profiles",
      },
      async () => {
        await fetchMembers("profiles_realtime");
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}, [sessionId, fetchMembers]);
*/

  useEffect(() => {
    if (!sessionId) return;

    const timer = window.setInterval(() => {
      void fetchMembers("poll");
    }, 10000);

    return () => window.clearInterval(timer);
  }, [sessionId, fetchMembers]);

  useEffect(() => {
    const memberIds = new Set(members.map((m) => m.device_id));

    setPeerStates((prev) => {
      const next: Record<string, PeerState> = {};
      for (const [id, state] of Object.entries(prev)) {
        if (memberIds.has(id)) next[id] = state;
      }
      return next;
    });
  }, [members]);

  const handleRemoteCountChange = useCallback((_count: number) => {}, []);

  const filled = members.length;

  const muteButtonLabel = useMemo(() => {
    if (!micReady) return "マイク準備中…";
    return isMuted ? "ミュート解除" : "ミュート";
  }, [micReady, isMuted]);

  const getMemberStatus = useCallback(
    (member?: Member) => {
      if (!member) {
        return {
          text: "待機中",
          color: "#9ca3af",
          chipBg: "#f3f4f6",
          chipText: "#6b7280",
        };
      }

      const isMe = member.device_id === deviceId;

      if (isMe) {
        return {
          text: isMuted ? "自分 / ミュート中" : "自分 / 発話可能",
          color: "#6b7280",
          chipBg: isMuted ? "#fef2f2" : "#eff6ff",
          chipText: isMuted ? "#991b1b" : "#1d4ed8",
        };
      }

      const state = peerStates[member.device_id] ?? "idle";

      if (state === "connected") {
        return {
          text: "接続中",
          color: "#065f46",
          chipBg: "#ecfdf5",
          chipText: "#047857",
        };
      }

      if (state === "connecting") {
        return {
          text: "接続処理中",
          color: "#92400e",
          chipBg: "#fffbeb",
          chipText: "#b45309",
        };
      }

      if (state === "failed") {
        return {
          text: "再接続中",
          color: "#991b1b",
          chipBg: "#fef2f2",
          chipText: "#dc2626",
        };
      }

      return {
        text: "接続待ち",
        color: "#6b7280",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
      };
    },
    [deviceId, isMuted, peerStates]
  );

  const hasOtherMember = members.some((m) => m.device_id !== deviceId);

  const lastSpeakerIdRef = useRef<string | null>(null);

  const speakingMemberId = useMemo(() => {
    const now = Date.now();
    const SPEAKING_MS = 1500;

    const speaking = members.find(
      (m) => !!m.lastSpokeAt && now - m.lastSpokeAt < SPEAKING_MS
    );

    return speaking?.device_id ?? null;
  }, [members, micLevel]);

  useEffect(() => {
    if (speakingMemberId) {
      lastSpeakerIdRef.current = speakingMemberId;
    }
  }, [speakingMemberId]);

  const sortedMembers = useMemo(() => {
    const lastSpeakerId = lastSpeakerIdRef.current;

    return [...members].sort((a, b) => {
      const aIsLastSpeaker = a.device_id === lastSpeakerId;
      const bIsLastSpeaker = b.device_id === lastSpeakerId;

      if (aIsLastSpeaker !== bIsLastSpeaker) {
        return aIsLastSpeaker ? -1 : 1;
      }

      const aState = peerStates[a.device_id] ?? "idle";
      const bState = peerStates[b.device_id] ?? "idle";

      const priority: Record<PeerState, number> = {
        connected: 0,
        idle: 1,
        connecting: 2,
        failed: 3,
      };

      const aP = priority[aState] ?? 99;
      const bP = priority[bState] ?? 99;

      if (aP !== bP) {
        return aP - bP;
      }

      return 0;
    });
  }, [members, speakingMemberId, peerStates]);

  const callMembers = useMemo(() => {
  return members;
}, [members]);

  if (!deviceId) {
    return null;
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <CallVoiceLayer
        sessionId={sessionId}
        deviceId={deviceId}
        members={callMembers}
        isMuted={isMuted}
        onMicReadyChange={setMicReady}
        onMicLevelChange={(level) => {
          setMicLevel(level);

          if (!isMuted && level > 0.08) {
            setMembers((prev) =>
              prev.map((m) =>
                m.device_id === deviceId
                  ? { ...m, lastSpokeAt: Date.now() }
                  : m
              )
            );
          }
        }}
        onRemoteSpeakingChange={(remoteId) => {
          setMembers((prev) =>
            prev.map((m) =>
              m.device_id === remoteId
                ? { ...m, lastSpokeAt: Date.now() }
                : m
            )
          );
        }}
        onRemoteCountChange={handleRemoteCountChange}
        onStatusChange={setCallInfo}
        onPeerStatesChange={setPeerStates}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>
            通話ルーム
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
            参加人数 {filled}/{capacity}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={async () => {
              if (!sessionId || !classId) {
                alert("まだ招待リンクを作れません。");
                return;
              }

              const inviteUrl =
                `${window.location.origin}/room?invite=1&autojoin=1` +
                `&classId=${encodeURIComponent(classId)}` +
                `&sessionId=${encodeURIComponent(sessionId)}`;

              try {
                await navigator.clipboard.writeText(inviteUrl);
                alert("招待リンクをコピーしました");
              } catch {
                window.prompt(
                  "コピーできませんでした。下のリンクをコピーしてください。",
                  inviteUrl
                );
              }
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            }}
          >
            友達を招待
          </button>

          <button
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#374151",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
            }}
            onClick={() => {
              router.push(
                withDev(
                  `/room?autojoin=0&classId=${encodeURIComponent(classId)}` +
                    `&sessionId=${encodeURIComponent(sessionId)}`
                )
              );
            }}
          >
            退出
          </button>
        </div>
      </div>

      {fetchErrorCount > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "#fffbeb",
            color: "#92400e",
            border: "1px solid #fde68a",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          通話メンバーの取得を再試行中です。接続中の通話は維持します。
        </div>
      )}

      {!hasOtherMember && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "#f9fafb",
            color: "#6b7280",
            border: "1px solid #e5e7eb",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          相手の参加を待っています。
        </div>
      )}

      <section
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 12 }}>
          通話中のメンバー
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 12,
          }}
        >
          {Array.from({ length: capacity }).map((_, i) => {
            const member = sortedMembers[i];
            const isFilled = !!member;
            const isMe = member?.device_id === deviceId;
            const status = getMemberStatus(member);
            const avatarUrl = member ? getAvatarUrl(member.photo_path) : "";

            const now = Date.now();
            const isSpeaking =
              !!member?.lastSpokeAt && now - member.lastSpokeAt < 1500;

            return (
              <div
                key={member?.device_id ?? `empty-${i}`}
                style={{
                  minHeight: 96,
                  borderRadius: 16,
                  border: isSpeaking
                    ? "2px solid #22c55e"
                    : "1px solid #e5e7eb",
                  background: isFilled ? "#ffffff" : "#f9fafb",
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  boxShadow: isSpeaking
                    ? "0 8px 24px rgba(34,197,94,0.18)"
                    : "none",
                  transform: isSpeaking ? "translateY(-2px)" : "none",
                  transition:
                    "transform 160ms ease, box-shadow 160ms ease, border 160ms ease",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: isFilled ? "#dbeafe" : "#e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 900,
                    overflow: "hidden",
                    flexShrink: 0,
                    border: isMe ? "2px solid #22c55e" : "1px solid #d1d5db",
                  }}
                >
                  {member ? (
                    <img
                      src={avatarUrl}
                      alt={member.display_name}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/default-avatar.jpg";
                      }}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : null}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: isFilled ? "#111827" : "#9ca3af",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {isFilled
                      ? isMe
                        ? `${member.display_name} (You)`
                        : member.display_name
                      : "空席"}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: isSpeaking ? "#dcfce7" : status.chipBg,
                      color: isSpeaking ? "#166534" : status.chipText,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {isSpeaking ? "発話中" : status.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* <YouTubeWatchParty sessionId={sessionId} deviceId={deviceId} /> */}

{/* 
<section style={{ marginTop: 16 }}>
  {sessionId ? <SharedCanvasBoard sessionId={sessionId} /> : null}
</section>
*/}

      <section
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 15 }}>音声設定</div>

        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            disabled={!micReady}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: isMuted ? "#fff" : "#111827",
              color: isMuted ? "#111827" : "#fff",
              fontWeight: 900,
              cursor: micReady ? "pointer" : "not-allowed",
              opacity: micReady ? 1 : 0.6,
            }}
            onClick={() => {
              setIsMuted((prev) => !prev);
            }}
          >
            {muteButtonLabel}
          </button>

          <div style={{ fontSize: 12, color: "#374151", minWidth: 180 }}>
            マイク入力: {(micLevel * 100).toFixed(1)}
          </div>

          <div
            style={{
              width: 140,
              height: 10,
              borderRadius: 999,
              background: "#e5e7eb",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, micLevel * 800)}%`,
                height: "100%",
                background: "#111827",
              }}
            />
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        {sessionId ? <SharedCanvasBoard sessionId={sessionId} /> : null}
      </section>

      <div style={{ marginTop: 16 }}>
        <SessionMessages
          sessionId={sessionId}
          deviceId={deviceId}
          displayName={
            members.find((m) => m.device_id === deviceId)?.display_name ||
            "参加者"
          }
          title="メッセージ"
          maxHeight={240}
          collapsible
        />
      </div>
    </main>
  );
}