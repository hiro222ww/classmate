// app/HomeClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function safeUUID(): string {
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getOrCreateDeviceId(): string {
  const key = "device_id";
  let id = "";
  try {
    id = localStorage.getItem(key) || "";
    if (!id) {
      id = safeUUID();
      localStorage.setItem(key, id);
    }
  } catch {}
  return id || "unknown";
}

type Profile = {
  device_id: string;
  display_name: string;
};

type RecentClass = {
  id: string;      // class_id か、無ければ url を入れてOK
  title: string;   // 表示名
  url: string;     // ここへ戻る
  updatedAt: number;
};

function readRecent(): RecentClass[] {
  try {
    const raw = localStorage.getItem("classmate_recent_classes") || "[]";
    const arr = JSON.parse(raw) as RecentClass[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function HomeClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recent, setRecent] = useState<RecentClass[]>([]);

  useEffect(() => {
    setRecent(readRecent());

    (async () => {
      try {
        const deviceId = getOrCreateDeviceId();
        const res = await fetch(`/api/profile?device_id=${encodeURIComponent(deviceId)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else {
          setProfile(null);
        }
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const recentSorted = useMemo(() => {
    const arr = [...recent];
    arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return arr;
  }, [recent]);

  // ✅ ここを課金で拡張：free=1、premium=5/20 など
  const freeLimit = 1;
  const visible = recentSorted.slice(0, freeLimit);

  if (loading) return <p style={{ margin: 0 }}>読み込み中...</p>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {profile ? (
        <p style={{ margin: 0 }}>
          ようこそ、<b>{profile.display_name}</b> さん
        </p>
      ) : (
        <p style={{ margin: 0 }}>はじめにプロフィール登録が必要です。</p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => router.push("/class/select")}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          はじめる（入る場所を選ぶ）
        </button>

        <button
          onClick={() => router.push("/room")}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#f2f2f2",
            color: "#111",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          フリーで入室（すぐ待機）
        </button>

        {!profile ? (
          <button
            onClick={() => router.push("/profile")}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            プロフィール登録
          </button>
        ) : null}
      </div>

      {/* ✅ 自分のクラス（最近入ったクラス） */}
      <div style={{ marginTop: 6, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>自分のクラス</div>

        {visible.length === 0 ? (
          <div style={{ color: "#6b7280", fontWeight: 800, fontSize: 13 }}>
            まだありません。ボードから入るとここに表示されます。
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {visible.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(c.url)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                {c.title}
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, marginTop: 4 }}>
                  ここに戻る
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
          課金の意義（設計）：無料は最新1件だけ保持／有料は最近のクラスを複数（例：5/20）保持して「迷子」をゼロにする
        </div>
      </div>
    </div>
  );
}
