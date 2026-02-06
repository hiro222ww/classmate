"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  created_at?: string;
};

type MatchPrefs = { min_age: number; max_age: number };

export default function ClassSelectPage() {
  const [deviceId, setDeviceId] = useState("");
  const [isPremium, setIsPremium] = useState(false);

  const [worlds, setWorlds] = useState<World[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);

  // 無料：年齢フィルタ（将来マッチ条件）
  const [prefs, setPrefs] = useState<MatchPrefs>({ min_age: 18, max_age: 25 });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // ✅ テーマ（world/topic）フィルタ：全員使える（表示のため）
  const [wFilter, setWFilter] = useState<string>("all");
  const [tFilter, setTFilter] = useState<string>("all");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);

    (async () => {
      // entitlements（転校可否に使う）
      const er = await fetch("/api/user/entitlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: id }),
      });
      const ej = await er.json();
      if (er.ok) setIsPremium(Boolean(ej.isPremium));
      else {
        if (ej?.error === "profile_not_found") window.location.href = "/profile";
      }

      // prefs
      const pr = await fetch("/api/user/match-prefs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: id, mode: "get" }),
      });
      const pj = await pr.json();
      if (pr.ok && pj?.prefs) setPrefs({ min_age: pj.prefs.min_age, max_age: pj.prefs.max_age });

      // list
      const r = await fetch("/api/class/list");
      const j = await r.json();
      setWorlds(j.worlds ?? []);
      setTopics(j.topics ?? []);
      setClasses(j.classes ?? []);
    })();
  }, []);

  async function savePrefs(next: MatchPrefs) {
    setSavingPrefs(true);
    try {
      const r = await fetch("/api/user/match-prefs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, minAge: next.min_age, maxAge: next.max_age }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j?.error ?? "failed");
        return;
      }
      setPrefs({ min_age: j.minAge, max_age: j.maxAge });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function transfer(newClassId: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/class/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, newClassId }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (j?.error === "premium_required") {
          alert("このクラスはPremium限定です。");
          return;
        }
        alert(j?.error ?? "failed");
        return;
      }
      window.location.href = "/class";
    } finally {
      setBusy(false);
    }
  }

  // ====== 絞り込み ======
  const filtered = useMemo(() => {
    const maxA = Math.max(prefs.min_age, prefs.max_age);

    return classes.filter((c) => {
      // 18未満レンジならセンシティブを見せない（現行維持）
      if (c.is_sensitive && maxA < 18) return false;

      // ✅ テーマ選択したら即反映（Premium/無料の表示に関係なく適用）
      if (wFilter !== "all" && c.world_key !== wFilter) return false;
      if (tFilter !== "all" && c.topic_key !== tFilter) return false;

      return true;
    });
  }, [classes, prefs, wFilter, tFilter]);

  // 表示ブロック（Premiumは“常に表示”）
  const freeRecommended = useMemo(
    () =>
      filtered
        .filter((c) => !c.is_premium && !c.is_sensitive)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 6),
    [filtered]
  );

  const freeAll = useMemo(
    () => filtered.filter((c) => !c.is_premium).sort((a, b) => a.name.localeCompare(b.name)),
    [filtered]
  );

  const premiumAll = useMemo(
    () => filtered.filter((c) => c.is_premium).sort((a, b) => a.name.localeCompare(b.name)),
    [filtered]
  );

  function Badge({ c }: { c: ClassRow }) {
    return (
      <span style={{ fontSize: 12, opacity: 0.85 }}>
        {c.is_premium ? "💎" : "🆓"} {c.is_sensitive ? "🔞" : "🟢"}
      </span>
    );
  }

  function Card({ c }: { c: ClassRow }) {
    // ✅ Premiumクラスは「常に表示」するが、権限がなければロック
    const locked = c.is_premium && !isPremium;

    return (
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 12,
          opacity: locked ? 0.55 : 1,
          filter: locked ? "grayscale(0.5)" : "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <strong>{c.name}</strong>
          <Badge c={c} />
        </div>

        <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{c.description || "（説明なし）"}</p>

        <button
          onClick={() => (locked ? alert("このクラスはPremium限定です。") : transfer(c.id))}
          disabled={busy}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 12 }}
        >
          {locked ? "🔒 Premium限定" : "このクラスに転校"}
        </button>
      </div>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>転校先を選ぶ</h1>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>テーマを選ぶ → クラスが出る</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/class">戻る</Link>
          <Link href="/class/create">クラス作成</Link>
        </div>
      </header>

      {/* テーマ選択（全員使える：選んだら即反映） */}
      <section style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={wFilter} onChange={(e) => setWFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
          <option value="all">世界観: すべて</option>
          {worlds.map((w) => (
            <option key={w.world_key} value={w.world_key}>
              {w.title} {w.is_sensitive ? "🔞" : ""} {w.is_premium ? "💎" : ""}
            </option>
          ))}
        </select>

        <select value={tFilter} onChange={(e) => setTFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
          <option value="all">テーマ: すべて</option>
          {topics.map((t) => (
            <option key={t.topic_key} value={t.topic_key}>
              {t.title} {t.is_sensitive ? "🔞" : ""} {t.is_premium ? "💎" : ""}
            </option>
          ))}
        </select>
      </section>

      {/* 年齢フィルタ（無料） */}
      <section style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong>年齢フィルタ</strong>
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            現在：{Math.min(prefs.min_age, prefs.max_age)}〜{Math.max(prefs.min_age, prefs.max_age)}歳
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>
            最小年齢
            <input
              type="number"
              value={prefs.min_age}
              onChange={(e) => setPrefs((p) => ({ ...p, min_age: Number(e.target.value) }))}
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ fontSize: 12, opacity: 0.8 }}>
            最大年齢
            <input
              type="number"
              value={prefs.max_age}
              onChange={(e) => setPrefs((p) => ({ ...p, max_age: Number(e.target.value) }))}
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 6 }}
            />
          </label>
        </div>

        <button
          onClick={() => savePrefs(prefs)}
          disabled={savingPrefs || !deviceId}
          style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12 }}
        >
          保存
        </button>
      </section>

      {/* 並び：無料おすすめ → 無料全部 → Premium（常に表示） */}
      <section style={{ marginTop: 16 }}>
        <h2 style={{ margin: "10px 0" }}>おすすめ（無料）</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {freeRecommended.map((c) => (
            <Card key={c.id} c={c} />
          ))}
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ margin: "10px 0" }}>無料クラス</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {freeAll.map((c) => (
            <Card key={c.id} c={c} />
          ))}
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ margin: "10px 0" }}>Premiumクラス</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {premiumAll.map((c) => (
            <Card key={c.id} c={c} />
          ))}
        </div>
      </section>
    </main>
  );
}
