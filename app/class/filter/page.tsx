"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/device";

type World = {
  world_key: string;
  title: string;
  description: string;
  is_sensitive: boolean;
  min_age: number;
  is_premium: boolean;
};

type Topic = {
  topic_key: string;
  title: string;
  description: string;
  is_sensitive: boolean;
  min_age: number;
  is_premium: boolean;
};

type ClassRow = {
  id: string;
  name: string;
  description: string;
  world_key: string | null;
  topic_key: string | null;
  min_age: number;
  is_sensitive: boolean;
  is_premium: boolean;
  is_user_created: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// “見せすぎない”ための暫定：BLっぽいテーマを検出して深い階層に隠す
function isBlTopic(t: Topic) {
  const s = `${t.topic_key} ${t.title}`.toLowerCase();
  return s.includes("bl") || s.includes("boys love") || s.includes("創作bl");
}

const AGE_MIN = 18; // とりあえず成人だけ
const AGE_MAX = 130;

/**
 * useSearchParams() を使う本体は、Suspense の内側に置く必要がある（Next.js のビルド要件）
 */
function ClassFilterPageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);

  // 世界観・テーマ（任意）
  const [worldKey, setWorldKey] = useState<string>(() => sp.get("world") || "all");
  const [topicKey, setTopicKey] = useState<string>(() => sp.get("topic") || "all");

  // 年齢レンジ（固定プリセットなし）
  const [minAge, setMinAge] = useState<number>(() => {
    const v = Number(sp.get("minAge"));
    return Number.isFinite(v) ? clamp(v, AGE_MIN, AGE_MAX) : 16;
  });
  const [maxAge, setMaxAge] = useState<number>(() => {
    const v = Number(sp.get("maxAge"));
    return Number.isFinite(v) ? clamp(v, AGE_MIN, AGE_MAX) : 29;
  });

  // “テーマを見せすぎない”
  const [showThemes, setShowThemes] = useState(false);
  const [step, setStep] = useState<"root" | "creative" | "relation">("root");

  useEffect(() => {
    getOrCreateDeviceId();

    (async () => {
      const r = await fetch("/api/class/list");
      const j = await r.json();
      setWorlds(j.worlds ?? []);
      setTopics(j.topics ?? []);
      setClasses(j.classes ?? []);
      setLoading(false);
    })();
  }, []);

  const freeWorlds = useMemo(() => worlds.filter((w) => !w.is_premium), [worlds]);

  // 初期は Free topics のみ（見せすぎない）
  const visibleTopics = useMemo(() => {
    const free = topics.filter((t) => !t.is_premium);
    return showThemes ? topics : free;
  }, [topics, showThemes]);

  const creativeTopics = useMemo(() => {
    return visibleTopics.filter((t) => {
      const s = t.title;
      return s.includes("創作") || s.includes("小説") || s.includes("漫画") || s.includes("イラスト");
    });
  }, [visibleTopics]);

  const relationFreeTopics = useMemo(() => {
    return visibleTopics.filter((t) => {
      const s = t.title;
      const isRelation = s.includes("関係性") || s.includes("恋愛") || s.includes("友情");
      return isRelation && !t.is_premium && !isBlTopic(t);
    });
  }, [visibleTopics]);

  const blTopics = useMemo(() => topics.filter((t) => isBlTopic(t)), [topics]);

  function apply() {
    const q = new URLSearchParams();

    // 年齢レンジは必ず付ける（UIが年齢レンジのみなので）
    q.set("minAge", String(minAge));
    q.set("maxAge", String(maxAge));

    if (worldKey !== "all") q.set("world", worldKey);
    if (topicKey !== "all") q.set("topic", topicKey);

    router.push(`/class/select?${q.toString()}`);
  }

  function resetAll() {
    setMinAge(16);
    setMaxAge(29);
    setWorldKey("all");
    setTopicKey("all");
    setShowThemes(false);
    setStep("root");
  }

  if (loading) {
    return (
      <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        読み込み中...
      </main>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>絞り込み</h1>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            年齢は細かく指定。テーマは必要な人だけ。
          </div>
        </div>
        <button
          onClick={() => router.push("/class/select")}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "#fff" }}
        >
          戻る
        </button>
      </header>

      {/* 年齢（レンジのみ） */}
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 14, margin: "0 0 8px 0", opacity: 0.8 }}>年齢（表示の絞り込み）</h2>

        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            {minAge} 〜 {maxAge} 歳
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>最小</div>
              <input
                type="range"
                min={AGE_MIN}
                max={AGE_MAX}
                value={minAge}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMinAge(v);
                  if (v > maxAge) setMaxAge(v);
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>最大</div>
              <input
                type="range"
                min={AGE_MIN}
                max={AGE_MAX}
                value={maxAge}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMaxAge(v);
                  if (v < minAge) setMinAge(v);
                }}
              />
            </div>

            <div style={{ fontSize: 12, opacity: 0.65 }}>
              ※ これは「クラス一覧の表示」を絞るための設定です（入室制限は🔞のみ別で扱うのが安全）。
            </div>
          </div>
        </div>
      </section>

      {/* 世界観：Freeのみ見せる */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 14, margin: "0 0 8px 0", opacity: 0.8 }}>世界観（Free）</h2>
        <select
          value={worldKey}
          onChange={(e) => setWorldKey(e.target.value)}
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", width: "100%" }}
        >
          <option value="all">選ばない（おすすめのまま）</option>
          {freeWorlds.map((w) => (
            <option key={w.world_key} value={w.world_key}>
              {w.title} {w.is_sensitive ? "🔞" : ""}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
          ※ Premium世界観は、入室のタイミングで案内します（後出し）。
        </div>
      </section>

      {/* テーマ：必要な人だけ */}
      <section style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <h2 style={{ fontSize: 14, margin: 0, opacity: 0.8 }}>テーマ（必要な人だけ）</h2>
          <button
            onClick={() => setShowThemes((v) => !v)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: showThemes ? "#111" : "#fff",
              color: showThemes ? "#fff" : "#111",
              fontWeight: 700,
            }}
          >
            {showThemes ? "テーマを閉じる" : "テーマで絞る"}
          </button>
        </div>

        {!showThemes ? (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            まずはおすすめ（Free）で十分な設計です。<br />
            どうしても探したいときだけ開いてください。
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {step === "root" && (
              <>
                <button onClick={() => setStep("creative")} style={PrimaryRowBtnStyle}>
                  創作系から探す（深掘り）
                </button>

                <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Freeテーマ（軽め）</div>
                  <TopicSelect
                    value={topicKey}
                    onChange={setTopicKey}
                    topics={visibleTopics.filter((t) => !isBlTopic(t))}
                  />
                </div>
              </>
            )}

            {step === "creative" && (
              <>
                <BackRow onClick={() => setStep("root")} label="戻る" />
                <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>創作系（Free中心）</div>
                  <TopicSelect
                    value={topicKey}
                    onChange={setTopicKey}
                    topics={creativeTopics.filter((t) => !isBlTopic(t))}
                  />
                </div>

                <button onClick={() => setStep("relation")} style={PrimaryRowBtnStyle}>
                  関係性テーマへ（さらに深い）
                </button>
              </>
            )}

            {step === "relation" && (
              <>
                <BackRow onClick={() => setStep("creative")} label="戻る" />

                <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                    関係性（ここから先は Premium が混ざります）
                  </div>

                  {/* まずはFreeの関係性 */}
                  <TopicSelect value={topicKey} onChange={setTopicKey} topics={relationFreeTopics} />

                  {/* BL（Premium）はさらに下にだけ表示 */}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #ddd" }}>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>BL（Premium）</div>
                    <TopicSelect value={topicKey} onChange={setTopicKey} topics={blTopics} premiumHint />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* 操作 */}
      <section style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <button
          onClick={resetAll}
          style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ddd", background: "#fff" }}
        >
          リセット
        </button>
        <button
          onClick={apply}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 12,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          適用してクラスを見る
        </button>
      </section>
    </main>
  );
}

const PrimaryRowBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 14,
  border: "1px solid #ddd",
  background: "#fff",
  fontWeight: 800,
  textAlign: "left",
};

function BackRow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid #eee",
        background: "#fafafa",
        textAlign: "left",
        fontWeight: 700,
      }}
    >
      ← {label}
    </button>
  );
}

function TopicSelect({
  value,
  onChange,
  topics,
  premiumHint,
}: {
  value: string;
  onChange: (v: string) => void;
  topics: Topic[];
  premiumHint?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", width: "100%" }}
    >
      <option value="all">選ばない</option>
      {topics.map((t) => (
        <option key={t.topic_key} value={t.topic_key}>
          {t.title}
          {premiumHint && t.is_premium ? "（Premium）" : ""}
          {t.is_sensitive ? " 🔞" : ""}
        </option>
      ))}
    </select>
  );
}

/**
 * ✅ これが “page” の default export
 * useSearchParams() を使う Inner を Suspense で包む
 */
export default function Page() {
  return (
    <Suspense fallback={<main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>読み込み中...</main>}>
      <ClassFilterPageInner />
    </Suspense>
  );
}
