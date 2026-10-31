"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeBrandVisual } from "@/components/brand/HomeBrandVisual";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";

/**
 * Official class create (entitlement-gated). Restored after this route was
 * accidentally overwritten with the legacy /class/filter UI.
 */
export default function ClassCreatePage() {
  const router = useRouter();
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
    setDeviceId(String(getDeviceId() ?? "").trim());
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
    return j.worldKey as string;
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
    return j.topicKey as string;
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

      alert("クラスを作成しました");
      router.push(withDev("/class/mine"));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="cm-classroom-scope"
      style={{
        padding: "16px 16px 28px",
        maxWidth: 720,
        margin: "0 auto",
        color: "var(--cm-text)",
      }}
    >
      <HomeBrandVisual />

      <header className="cm-page-heading" style={{ marginTop: 14 }}>
        <h1>クラス作成</h1>
        <p>権限があるアカウントのみ作成できます</p>
      </header>

      <section
        className="cm-paper-card"
        style={{
          marginTop: 12,
          border: "1px solid var(--cm-border, #e5eaf2)",
          borderRadius: 14,
          padding: 14,
          display: "grid",
          gap: 12,
          background: "#fff",
        }}
      >
        <div>
          <label htmlFor="cm-create-name" style={{ fontSize: 12, fontWeight: 800 }}>
            クラス名
          </label>
          <input
            id="cm-create-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 4 }}
          />
        </div>

        <div>
          <label
            htmlFor="cm-create-description"
            style={{ fontSize: 12, fontWeight: 800 }}
          >
            説明
          </label>
          <textarea
            id="cm-create-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              height: 90,
              marginTop: 4,
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label htmlFor="cm-create-world" style={{ fontSize: 12, fontWeight: 800 }}>
              新しい世界観（任意）
            </label>
            <input
              id="cm-create-world"
              value={worldTitle}
              onChange={(e) => setWorldTitle(e.target.value)}
              placeholder="例：夜の学校"
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 4 }}
            />
          </div>
          <div>
            <label htmlFor="cm-create-topic" style={{ fontSize: 12, fontWeight: 800 }}>
              新しいテーマ（任意）
            </label>
            <input
              id="cm-create-topic"
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              placeholder="例：雑談"
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 4 }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label htmlFor="cm-create-min-age" style={{ fontSize: 12, fontWeight: 800 }}>
              最低年齢
            </label>
            <input
              id="cm-create-min-age"
              type="number"
              value={minAge}
              onChange={(e) => setMinAge(Number(e.target.value))}
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 4 }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
            <input
              type="checkbox"
              checked={isSensitive}
              onChange={(e) => setIsSensitive(e.target.checked)}
            />
            センシティブ
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
            <input
              type="checkbox"
              checked={isPremium}
              onChange={(e) => setIsPremium(e.target.checked)}
            />
            プレミアム
          </label>
        </div>

        <button
          type="button"
          className="cm-cta-primary"
          onClick={() => void createClass()}
          disabled={busy || !name.trim() || !deviceId}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "none",
            fontWeight: 900,
            cursor: busy || !name.trim() ? "default" : "pointer",
            opacity: busy || !name.trim() ? 0.7 : 1,
          }}
        >
          {busy ? "作成中…" : "作成する"}
        </button>
      </section>
    </main>
  );
}
