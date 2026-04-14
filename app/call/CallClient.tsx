"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SharedCanvasBoard from "./SharedCanvasBoard";
import CallVoiceLayer from "./CallVoiceLayer";
import { supabase } from "@/lib/supabaseClient";
import { getDeviceId } from "@/lib/device";

type Member = {
  device_id: string;
  display_name: string;
  photo_path: string | null;
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
  }>;
  memberCount?: number;
  error?: string;
};

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

export default function CallClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sessionId = searchParams.get("sessionId") || "";
  const classId = searchParams.get("classId") || "";
  const dev = searchParams.get("dev") || "";

  const deviceId = useMemo(() => getDeviceId(), []);

  const returnTo = `/room?sessionId=${sessionId}&classId=${classId}${
    dev ? `&dev=${dev}` : ""
  }`;

  const [members, setMembers] = useState<Member[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [micReady, setMicReady] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [callInfo, setCallInfo] = useState("");
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});
  const [capacity, setCapacity] = useState(5);

  const fetchMembers = useCallback(async () => {
    if (!sessionId || !classId) {
      setMembers([]);
      return;
    }

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
          status: res.status,
          statusText: res.statusText,
          rawText,
        });
        return;
      }

      if (!json) {
        console.warn("[call] session status non-json or empty response", {
          rawText,
        });
        return;
      }

      if (!json.ok) {
        console.warn("[call] session status api not ok", {
          error: json.error || "session_status_failed",
          rawText,
        });
        return;
      }

      const incoming = Array.isArray(json.members) ? json.members : [];
      console.log("[call] incoming members", incoming);

      const nextMembers: Member[] = [];

      for (const m of incoming) {
        const did = String(m.device_id ?? "").trim();
        if (!did) continue;

        nextMembers.push({
          device_id: did,
          display_name: String(m.display_name ?? "").trim() || "参加者",
          photo_path: String(m.photo_path ?? "").trim() || null,
        });
      }

      console.log("[call] nextMembers", nextMembers);
      setMembers(nextMembers);

      if (Number.isFinite(Number(json.session?.capacity))) {
        setCapacity(Number(json.session?.capacity));
      }
    } catch (e: any) {
      console.error("[call] fetchMembers unexpected error", {
        message: e?.message ?? "unknown_error",
      });
    }
  }, [sessionId, classId]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

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
          await fetchMembers();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, fetchMembers]);

  useEffect(() => {
    const channel = supabase
      .channel(`call-profiles-${sessionId || "no-session"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_profiles",
        },
        async () => {
          await fetchMembers();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, fetchMembers]);

  useEffect(() => {
    if (!sessionId) return;

    const timer = window.setInterval(() => {
      void fetchMembers();
    }, 2000);

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

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <CallVoiceLayer
        sessionId={sessionId}
        deviceId={deviceId}
        members={members}
        isMuted={isMuted}
        onMicReadyChange={setMicReady}
        onMicLevelChange={setMicLevel}
        onRemoteCountChange={() => {}}
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

        <button
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #fca5a5",
            background: "#fee2e2",
            color: "#7f1d1d",
            fontWeight: 900,
            cursor: "pointer",
          }}
          onClick={() => router.push(returnTo)}
        >
          退出
        </button>
      </div>

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
            const member = members[i];
            const isFilled = !!member;
            const isMe = member?.device_id === deviceId;
            const status = getMemberStatus(member);
            const avatarUrl = member ? getAvatarUrl(member.photo_path) : "";

            return (
              <div
                key={i}
                style={{
                  minHeight: 96,
                  borderRadius: 16,
                  border: "1px solid #e5e7eb",
                  background: isFilled ? "#ffffff" : "#f9fafb",
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
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
                        console.log("[call avatar ng]", {
                          display_name: member.display_name,
                          photo_path: member.photo_path,
                          avatarUrl,
                        });
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/default-avatar.jpg";
                      }}
                      onLoad={() => {
                        console.log("[call avatar ok]", {
                          display_name: member.display_name,
                          photo_path: member.photo_path,
                          avatarUrl,
                        });
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
                      background: status.chipBg,
                      color: status.chipText,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {status.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

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

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
          {callInfo || "通話シグナリング待機中"}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        {sessionId ? <SharedCanvasBoard sessionId={sessionId} /> : null}
      </section>
    </main>
  );
}