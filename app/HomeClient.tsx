"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * iOS Safari 等で crypto.randomUUID が無い場合のフォールバック付き UUID 生成
 */
function safeUUID(): string {
  const c = globalThis.crypto as Crypto | undefined;

  // 1) randomUUID が使える環境
  if (c && typeof (c as any).randomUUID === "function") {
    return (c as any).randomUUID();
  }

  // 2) getRandomValues が使える環境（UUID v4 互換）
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint8Array(16);
    c.getRandomValues(buf);
    buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
    buf[8] = (buf[8] & 0x3f) | 0x80; // variant
    const hex = [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // 3) 最後の手段
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getOrCreateDeviceId(): string {
  const key = "device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = safeUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

type Profile = {
  device_id: string;
  display_name: string;
};

export default function HomeClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const deviceId = getOrCreateDeviceId();
        const res = await fetch(`/api/profile?device_id=${encodeURIComponent(deviceId)}`);
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

  if (loading) {
    return <p>読み込み中...</p>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {profile ? (
        <>
          <p style={{ margin: 0 }}>
            ようこそ、<b>{profile.display_name}</b> さん
          </p>
          <button
            onClick={() => router.push("/room")}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            入室する
          </button>
        </>
      ) : (
        <>
          <p style={{ margin: 0 }}>はじめにプロフィール登録が必要です。</p>
          <button
            onClick={() => router.push("/profile")}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            プロフィール登録
          </button>
        </>
      )}
    </div>
  );
}
