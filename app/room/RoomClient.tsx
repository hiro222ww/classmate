// app/room/RoomClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChalkboardRoomShell } from "./ChalkboardRoomShell";
import { getOrCreateDeviceId } from "@/lib/device";

type Profile = {
  device_id: string;
  display_name: string;
  birth_date: string | null;
  gender: string | null;
  photo_path: string | null;
};

type JoinResult = {
  sessionId: string;
  status: "forming" | "active" | "closed";
  memberCount: number;
  capacity: number;
};

function AvatarRow({ count, capacity }: { count: number; capacity: number }) {
  const n = Math.max(0, Math.min(count, capacity));
  const items = Array.from({ length: capacity }, (_, i) => i);

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map((i) => {
        const filled = i < n;
        return (
          <div
            key={i}
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: filled ? "#111" : "#f0f0f0",
              color: filled ? "#fff" : "#aaa",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              fontSize: 12,
            }}
            title={filled ? "参加中" : "空き"}
          >
            {filled ? "●" : "○"}
          </div>
        );
      })}
    </div>
  );
}

export default function RoomClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [debug, setDebug] = useState<string>("");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [capacity, setCapacity] = useState(5);

  // プロフィール登録チェック（未登録なら /profile）
  useEffect(() => {
    (async () => {
      const deviceId = getOrCreateDeviceId();
      const res = await fetch(
        `/api/profile?device_id=${encodeURIComponent(deviceId)}`
      );
      const data = res.ok ? await res.json() : null;

      if (!data) {
        router.replace("/profile");
        return;
      }

      setProfile(data);
      setLoading(false);
    })();
  }, [router]);

  async function joinSession() {
    if (!profile || joining) return;

    setJoinError("");
    setDebug("");
    setJoining(true);

    try {
      const res = await fetch("/api/session/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "default",
          name: profile.display_name,
          capacity: 5,
        }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        setJoinError(msg || "参加に失敗しました");
        return;
      }

      const data: JoinResult = await res.json();
      setDebug(JSON.stringify(data, null, 2));

      if (!data.sessionId) {
        setJoinError(
          "APIの返り値に sessionId がありません（/api/session/join を確認してください）"
        );
        return;
      }

      setSessionId(data.sessionId);
      setMemberCount(data.memberCount);
      setCapacity(data.capacity);

      // 2人以上なら自動で通話へ（必ず sessionId 付き）
      if (data.memberCount >= 2) {
        router.push(`/call?sessionId=${encodeURIComponent(data.sessionId)}`);
      }
    } catch (e: any) {
      setJoinError(e?.message ?? "参加に失敗しました");
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <p style={{ padding: 16, color: "#111" }}>確認中...</p>;

  // 今はフリークラス固定（後で board 名に切り替え可）
  const title = "フリークラス";

  return (
    <ChalkboardRoomShell
      title={title}
      subtitle={profile ? `ようこそ、${profile.display_name} さん` : undefined}
      lines={[
        "無言でもOK",
        "合わなければ移動してOK",
        "2人以上で自動的に通話が始まります",
      ]}
    >
      <div style={{ display: "grid", gap: 12, color: "#111" }}>
        {joinError && (
          <div
            style={{
              padding: 10,
              border: "1px solid #f5c2c7",
              background: "#f8d7da",
              borderRadius: 10,
              color: "#842029",
            }}
          >
            <p style={{ margin: 0, fontWeight: 900 }}>エラー</p>
            <p style={{ margin: "6px 0 0 0" }}>{joinError}</p>
          </div>
        )}

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: 12,
            background: "#fff",
            color: "#111",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 900 }}>参加状況</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                参加者：<b>{memberCount}</b> / {capacity}
              </div>
            </div>

            <button
              onClick={joinSession}
              disabled={joining}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 900,
                cursor: joining ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {joining ? "入室中..." : "通話に入る"}
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <AvatarRow count={memberCount} capacity={capacity} />
          </div>

          {sessionId && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid #eee",
              }}
            >
              <div style={{ fontSize: 12, color: "#666" }}>
                sessionId:{" "}
                <span style={{ fontFamily: "monospace" }}>{sessionId}</span>
              </div>

              <a
                href={`/call?sessionId=${encodeURIComponent(sessionId)}`}
                style={{
                  display: "inline-block",
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#111",
                  color: "#fff",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                通話へ進む（手動）
              </a>
            </div>
          )}
        </div>

        {debug && (
          <pre
            style={{
              margin: 0,
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 12,
              overflow: "auto",
              background: "#fff",
              color: "#111",
            }}
          >
{debug}
          </pre>
        )}
      </div>
    </ChalkboardRoomShell>
  );
}
