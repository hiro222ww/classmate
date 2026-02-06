// app/admin/topics/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Topic = {
  topic_key: string;
  title: string;
  description: string;
  is_sensitive: boolean;
  min_age: number;
  monthly_price: number;
};

const PRICE_CHOICES = [0, 400, 800, 1200] as const;

export default function AdminTopicsPage() {
  const [password, setPassword] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const canUse = useMemo(() => password.length > 0, [password]);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, mode: "list" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "failed");
      setTopics(j.topics ?? []);
    } catch (e: any) {
      setError(e?.message ?? "load failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveTopic(t: Topic) {
    setError("");
    setSavingKey(t.topic_key);
    try {
      const r = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password,
          mode: "update",
          topic_key: t.topic_key,
          patch: {
            title: t.title,
            description: t.description,
            monthly_price: t.monthly_price,
            is_sensitive: t.is_sensitive,
            min_age: t.min_age,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "save failed");
    } catch (e: any) {
      setError(e?.message ?? "save failed");
    } finally {
      setSavingKey(null);
    }
  }

  useEffect(() => {
    // パスワードが入ったら自動ロード
    if (!canUse) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse]);

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 16, color: "#111" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>管理：テーマ編集</h1>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>topics.monthly_price を編集します（0/400/800/1200）</div>
        </div>
        <a href="/class/select" style={{ color: "#111", fontWeight: 800 }}>戻る</a>
      </header>

      <section style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 16, padding: 14, background: "#fff" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="password"
            placeholder="ADMIN_PASSWORD を入力"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ flex: 1, minWidth: 240, padding: 10, borderRadius: 12, border: "1px solid #ccc" }}
          />
          <button
            onClick={load}
            disabled={!canUse || loading}
            style={{ padding: "10px 12px", borderRadius: 12, fontWeight: 900 }}
          >
            {loading ? "読み込み中…" : "読み込み"}
          </button>
        </div>
        {error ? <p style={{ margin: "10px 0 0", color: "#b00020", fontWeight: 800 }}>{error}</p> : null}
      </section>

      <section style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {topics.map((t, idx) => (
          <div key={t.topic_key} style={{ border: "1px solid #ddd", borderRadius: 16, padding: 14, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>
                {idx + 1}. {t.title}{" "}
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#666" }}>({t.topic_key})</span>
              </strong>
              <span style={{ fontSize: 12, color: "#666" }}>
                min_age: {t.min_age} / {t.is_sensitive ? "🔞 sensitive" : "🟢 normal"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label style={{ fontSize: 12, color: "#666" }}>
                タイトル
                <input
                  value={t.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTopics((arr) => arr.map((x) => (x.topic_key === t.topic_key ? { ...x, title: v } : x)));
                  }}
                  style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ccc", marginTop: 6 }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#666" }}>
                月額（ティア）
                <select
                  value={t.monthly_price}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTopics((arr) => arr.map((x) => (x.topic_key === t.topic_key ? { ...x, monthly_price: v } : x)));
                  }}
                  style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ccc", marginTop: 6 }}
                >
                  {PRICE_CHOICES.map((p) => (
                    <option key={p} value={p}>
                      {p === 0 ? "無料(0)" : `¥${p}/月`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={{ display: "block", marginTop: 10, fontSize: 12, color: "#666" }}>
              説明
              <textarea
                value={t.description ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setTopics((arr) => arr.map((x) => (x.topic_key === t.topic_key ? { ...x, description: v } : x)));
                }}
                rows={3}
                style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ccc", marginTop: 6 }}
              />
            </label>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={t.is_sensitive}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setTopics((arr) => arr.map((x) => (x.topic_key === t.topic_key ? { ...x, is_sensitive: v } : x)));
                  }}
                />
                sensitive
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                min_age
                <input
                  type="number"
                  value={t.min_age}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTopics((arr) => arr.map((x) => (x.topic_key === t.topic_key ? { ...x, min_age: v } : x)));
                  }}
                  style={{ width: 90, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </label>

              <button
                onClick={() => saveTopic(t)}
                disabled={!canUse || savingKey === t.topic_key}
                style={{
                  marginLeft: "auto",
                  padding: "10px 12px",
                  borderRadius: 12,
                  fontWeight: 900,
                  background: "#111",
                  color: "#fff",
                  border: "none",
                  cursor: !canUse ? "not-allowed" : "pointer",
                }}
              >
                {savingKey === t.topic_key ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        ))}
      </section>

      {!loading && canUse && topics.length === 0 ? (
        <p style={{ marginTop: 12, fontSize: 12, color: "#666" }}>topics が0件です（seed入ってるか確認）</p>
      ) : null}
    </main>
  );
}
