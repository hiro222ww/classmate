"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOrCreateDeviceId } from "@/lib/device";

export default function ClassCreatePage() {
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [worldTitle, setWorldTitle] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [minAge, setMinAge] = useState(0);
  const [isSensitive, setIsSensitive] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  async function createWorldIfNeeded(): Promise<string | null> {
    const title = worldTitle.trim();
    if (!title) return null;
    const r = await fetch("/api/class/create-world", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId,
        title,
        description: "",
        minAge,
        isSensitive,
        isPremium,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? "create-world failed");
    return j.worldKey;
  }

  async function createTopicIfNeeded(): Promise<string | null> {
    const title = topicTitle.trim();
    if (!title) return null;
    const r = await fetch("/api/class/create-topic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId,
        title,
        description: "",
        minAge,
        isSensitive,
        isPremium,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? "create-topic failed");
    return j.topicKey;
  }

  async function createClass() {
    setBusy(true);
    try {
      const worldKey = await createWorldIfNeeded();
      const topicKey = await createTopicIfNeeded();

      const r = await fetch("/api/class/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          name,
          description,
          worldKey: worldKey ?? "default",
          topicKey: topicKey ?? "free_talk",
          minAge,
          isSensitive,
          isPremium,
        }),
      });

      const j = await r.json();
      if (!r.ok) {
        alert(j?.error ?? "作成できません（課金権限が必要です）");
        return;
      }

      alert("クラス作成OK（転校先一覧に出ます）");
      window.location.href = "/class/select";
    } catch (e: any) {
      alert(e?.message ?? "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>クラス作成（将来課金）</h1>
        <Link href="/class/select">戻る</Link>
      </header>

      <section style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          ※ 今は entitlements の can_create_classes=true のユーザーのみ作れます（課金機能が入ったらON）。
        </div>

        <div style={{ marginTop: 10 }}>
          <label>クラス名</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10 }} />
        </div>

        <div style={{ marginTop: 10 }}>
          <label>説明</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, height: 90 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <div>
            <label>新しい世界観（任意）</label>
            <input
              value={worldTitle}
              onChange={(e) => setWorldTitle(e.target.value)}
              placeholder="例：夜の学校 / 2000年代"
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
            />
          </div>
          <div>
            <label>新しいテーマ（任意）</label>
            <input
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              placeholder="例：野球部 / 倫理 / 創作"
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
          <div>
            <label>minAge</label>
            <input
              type="number"
              value={minAge}
              onChange={(e) => setMinAge(Number(e.target.value))}
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={isSensitive} onChange={(e) => setIsSensitive(e.target.checked)} />
            <label>センシティブ</label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} />
            <label>プレミアム</label>
          </div>
        </div>

        <button
          onClick={createClass}
          disabled={busy || !name.trim()}
          style={{ marginTop: 12, width: "100%", padding: "10px 12px", borderRadius: 12 }}
        >
          作成（権限が必要）
        </button>
      </section>
    </main>
  );
}
