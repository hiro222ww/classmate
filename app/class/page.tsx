// app/class/select/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getOrCreateDeviceId } from "@/lib/device";

type World = {
  world_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
};

type Topic = {
  topic_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
  monthly_price: number | null;
};

type ClassRow = {
  id: string;
  name: string | null;
  description: string | null;
  world_key: string | null;
  topic_key: string | null;
  min_age: number;
  is_sensitive: boolean;
  is_user_created: boolean;
  created_at: string | null;
};

type Entitlements = {
  device_id: string;
  plan: string;
  class_slots: number;
  can_create_classes: boolean;
  topic_plan: number;
  theme_pass: boolean;
  updated_at: string;
};

type ListResponse = {
  ok: boolean;
  worlds: World[];
  topics: Topic[];
  classes: ClassRow[];
  error?: string;
};

function badgeStyle(bg: string, color = "#111") {
  return {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 800 as const,
  };
}

function formatEntranceTitle(
  c: ClassRow,
  topicMap: Map<string, Topic>,
  worldMap: Map<string, World>
) {
  if (!c.topic_key) return "フリー";

  const topic = topicMap.get(c.topic_key);
  if (topic?.title) return topic.title;

  const raw = String(c.name || "").trim();
  if (raw) return raw;

  const world = c.world_key ? worldMap.get(c.world_key) : null;
  if (world?.title) return `${world.title}クラス`;

  return "クラス";
}

export default function ClassSelectPage() {
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [worlds, setWorlds] = useState<World[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);

  const [selectedWorldKey, setSelectedWorldKey] = useState<string>("all");
  const [selectedTopicKey, setSelectedTopicKey] = useState<string>("all");

  const worldMap = useMemo(
    () => new Map(worlds.map((w) => [w.world_key, w])),
    [worlds]
  );

  const topicMap = useMemo(
    () => new Map(topics.map((t) => [t.topic_key, t])),
    [topics]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const deviceId = getOrCreateDeviceId();

        const [listRes, entRes] = await Promise.all([
          fetch("/api/class/list", { cache: "no-store" }),
          fetch("/api/user/entitlements", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deviceId }),
            cache: "no-store",
          }),
        ]);

        const listJson: ListResponse = await listRes.json().catch(() => ({
          ok: false,
          worlds: [],
          topics: [],
          classes: [],
          error: "class_list_failed",
        }));

        const entJson = await entRes.json().catch(() => null);

        if (cancelled) return;

        if (!listRes.ok || !listJson?.ok) {
          throw new Error(listJson?.error || "class_list_failed");
        }

        setWorlds(Array.isArray(listJson.worlds) ? listJson.worlds : []);
        setTopics(Array.isArray(listJson.topics) ? listJson.topics : []);
        setClasses(Array.isArray(listJson.classes) ? listJson.classes : []);

        if (entRes.ok && entJson) {
          setEntitlements(entJson);
        } else {
          setEntitlements(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "読み込みに失敗しました");
          setWorlds([]);
          setTopics([]);
          setClasses([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 入口テーマだけ見せる
  const visibleEntrances = useMemo(() => {
    let rows = [...classes];

    if (selectedWorldKey !== "all") {
      rows = rows.filter((c) => c.world_key === selectedWorldKey);
    }

    if (selectedTopicKey !== "all") {
      if (selectedTopicKey === "__free__") {
        rows = rows.filter((c) => !c.topic_key);
      } else {
        rows = rows.filter((c) => c.topic_key === selectedTopicKey);
      }
    }

    // topic_key 単位で入口を1つにまとめる
    const map = new Map<string, ClassRow>();
    for (const c of rows) {
      const key = `${c.world_key ?? "default"}::${c.topic_key ?? "__free__"}`;
      if (!map.has(key)) map.set(key, c);
    }

    return [...map.values()];
  }, [classes, selectedWorldKey, selectedTopicKey]);

  async function matchJoinAndOpen(entrance: ClassRow) {
    try {
      const joinKey = `match:${entrance.world_key ?? "default"}:${entrance.topic_key ?? "__free__"}`;
      setJoiningId(joinKey);

      const deviceId = getOrCreateDeviceId();

      const res = await fetch("/api/class/match-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          worldKey: entrance.world_key ?? "default",
          topicKey: entrance.topic_key ?? "free",
          capacity: 5,
        }),
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      console.log("[select/match-join] response =", json);

      if (!res.ok || !json?.ok || !json?.classId) {
        alert(json?.error || "match_join_failed");
        return;
      }

      window.location.href = `/room?autojoin=1&classId=${encodeURIComponent(json.classId)}`;
    } catch (e: any) {
      console.error("[select/match-join] error =", e);
      alert(e?.message || "match_join_failed");
    } finally {
      setJoiningId(null);
    }
  }

  if (loading) {
    return <main style={{ padding: 16 }}>読み込み中…</main>;
  }

  return (
    <main style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>クラスを選ぶ</h1>
          <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
            テーマを選ぶと、その中の空きクラスへ自動で参加します。
          </div>

          <div style={{ fontSize: 12, marginTop: 10, color: "#444" }}>
            プラン: {entitlements?.plan ?? "free"} / クラス枠:{" "}
            {entitlements?.class_slots ?? 1} / テーマプラン:{" "}
            {entitlements?.topic_plan ?? 0} / テーマパス:{" "}
            {entitlements?.theme_pass ? "あり" : "なし"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/">自分のクラス一覧</Link>
          <Link href="/premium">お支払い・解約</Link>
        </div>
      </header>

      {error ? (
        <div style={{ marginTop: 16, color: "#dc2626", fontWeight: 800 }}>
          {error}
        </div>
      ) : null}

      <section
        style={{
          marginTop: 18,
          display: "grid",
          gap: 16,
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 14,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>world</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedWorldKey("all")}
              style={{
                ...badgeStyle(
                  selectedWorldKey === "all" ? "#111" : "#f3f4f6",
                  selectedWorldKey === "all" ? "#fff" : "#111"
                ),
                border: "none",
                cursor: "pointer",
              }}
            >
              すべて
            </button>

            {worlds.map((w) => (
              <button
                key={w.world_key}
                type="button"
                onClick={() => setSelectedWorldKey(w.world_key)}
                style={{
                  ...badgeStyle(
                    selectedWorldKey === w.world_key ? "#111" : "#f3f4f6",
                    selectedWorldKey === w.world_key ? "#fff" : "#111"
                  ),
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {w.title}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 14,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>topic</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedTopicKey("all")}
              style={{
                ...badgeStyle(
                  selectedTopicKey === "all" ? "#111" : "#f3f4f6",
                  selectedTopicKey === "all" ? "#fff" : "#111"
                ),
                border: "none",
                cursor: "pointer",
              }}
            >
              すべて
            </button>

            <button
              type="button"
              onClick={() => setSelectedTopicKey("__free__")}
              style={{
                ...badgeStyle(
                  selectedTopicKey === "__free__" ? "#111" : "#f3f4f6",
                  selectedTopicKey === "__free__" ? "#fff" : "#111"
                ),
                border: "none",
                cursor: "pointer",
              }}
            >
              フリー
            </button>

            {topics.map((t) => (
              <button
                key={t.topic_key}
                type="button"
                onClick={() => setSelectedTopicKey(t.topic_key)}
                style={{
                  ...badgeStyle(
                    selectedTopicKey === t.topic_key ? "#111" : "#f3f4f6",
                    selectedTopicKey === t.topic_key ? "#fff" : "#111"
                  ),
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {t.title}
                {Number(t.monthly_price ?? 0) > 0 ? ` ¥${t.monthly_price}` : ""}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>
          入口一覧（{visibleEntrances.length}件）
        </div>

        {visibleEntrances.length === 0 ? (
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 16,
              color: "#6b7280",
              fontWeight: 700,
              background: "#fff",
            }}
          >
            条件に合う入口がありません。
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            {visibleEntrances.map((c) => {
              const topic = c.topic_key ? topicMap.get(c.topic_key) : null;
              const world = c.world_key ? worldMap.get(c.world_key) : null;
              const joinKey = `match:${c.world_key ?? "default"}:${c.topic_key ?? "__free__"}`;
              const isJoining = joiningId === joinKey;

              return (
                <div
                  key={joinKey}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    padding: 14,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    {world?.title ? (
                      <span style={badgeStyle("#eef2ff")}>{world.title}</span>
                    ) : null}

                    {topic?.title ? (
                      <span style={badgeStyle("#ecfeff")}>{topic.title}</span>
                    ) : (
                      <span style={badgeStyle("#f3f4f6")}>フリー</span>
                    )}

                    {Number(topic?.monthly_price ?? 0) > 0 ? (
                      <span style={badgeStyle("#fff7ed")}>有料テーマ</span>
                    ) : (
                      <span style={badgeStyle("#f0fdf4")}>通常テーマ</span>
                    )}
                  </div>

                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {formatEntranceTitle(c, topicMap, worldMap)}
                  </div>

                  <div style={{ color: "#6b7280", fontSize: 12, marginTop: 10 }}>
                    参加時に空きクラスへ自動配属
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      disabled={isJoining}
                      onClick={() => matchJoinAndOpen(c)}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        background: "#111",
                        color: "#fff",
                        fontWeight: 900,
                        cursor: isJoining ? "default" : "pointer",
                        opacity: isJoining ? 0.7 : 1,
                      }}
                    >
                      {isJoining ? "参加中…" : "参加する"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}