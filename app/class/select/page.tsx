// app/class/select/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getOrCreateDeviceId } from "@/lib/device";
import AdminTopicEditor from "./AdminTopicEditor";

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
  monthly_price?: number; // 0/400/800/1200
  is_premium?: boolean; // 旧互換
};

type ClassRow = {
  id: string;
  name: string;
  description: string;
  world_key: string | null;
  topic_key: string | null;
  min_age: number;
  is_sensitive: boolean;
  is_premium?: boolean; // 旧互換
  is_user_created: boolean;
  created_at?: string;
};

type MatchPrefs = { min_age: number; max_age: number };

type Entitlements = {
  plan: string;
  class_slots: number;
  can_create_classes: boolean;
  topic_plan?: number; // 0/400/800/1200
  theme_pass?: boolean; // 旧互換
};

async function readJsonOrThrow(r: Response) {
  const ct = r.headers.get("content-type") ?? "";
  const raw = await r.text();
  if (!ct.includes("application/json")) {
    console.error("Non-JSON response:", raw);
    throw new Error("non_json_response");
  }
  const j = JSON.parse(raw);
  if (!r.ok) throw new Error(j?.error ?? "request_failed");
  return j;
}

function tierName(price: number) {
  if (price >= 1200) return "プレミアム";
  if (price >= 800) return "ミドル";
  if (price >= 400) return "ライト";
  return "無料";
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "4px 8px",
        borderRadius: 999,
        background: "#f0f0f0",
        color: "#111",
        fontWeight: 900,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </span>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          background: "#fff",
          color: "#111",
          borderRadius: 18,
          border: "1px solid #e5e5e5",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button
            onClick={onClose}
            style={{
              border: "1px solid #ddd",
              background: "#fff",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

export default function ClassSelectPage() {
  const [deviceId, setDeviceId] = useState("");

  const [worlds, setWorlds] = useState<World[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);

  const [prefs, setPrefs] = useState<MatchPrefs>({ min_age: 18, max_age: 25 });
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [wFilter, setWFilter] = useState<string>("all");
  const [tFilter, setTFilter] = useState<string>("all");

  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showNarrow, setShowNarrow] = useState(false);

  const [needSlotsOpen, setNeedSlotsOpen] = useState(false);
  const [needTopicOpen, setNeedTopicOpen] = useState(false);
  const [pendingClass, setPendingClass] = useState<ClassRow | null>(null);

  // ✅ 管理UIを表示する条件：
  // - ふだんは出さない
  // - URLに ?admin=1 を付けた時だけ出す（devでもprodでも）
  const [showAdminUI, setShowAdminUI] = useState(false);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setShowAdminUI(sp.get("admin") === "1");
    } catch {
      setShowAdminUI(false);
    }
  }, []);

  async function reloadCatalog() {
    const r = await fetch("/api/class/list", { cache: "no-store" });
    const j = await r.json();
    setWorlds(j.worlds ?? []);
    setTopics(j.topics ?? []);
    setClasses(j.classes ?? []);
  }

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);

    (async () => {
      try {
        const er = await fetch("/api/user/entitlements", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId: id }),
        });
        const ej = await er.json();
        if (!er.ok) {
          if (ej?.error === "profile_not_found") {
            window.location.href = "/profile";
            return;
          }
          throw new Error(ej?.error ?? "entitlements_failed");
        }

        const topicPlan =
          typeof ej.topic_plan === "number"
            ? ej.topic_plan
            : Boolean(ej.theme_pass)
              ? 1200
              : 0;

        setEnt({
          plan: ej.plan ?? "free",
          class_slots: ej.class_slots ?? 1,
          can_create_classes: ej.can_create_classes ?? false,
          theme_pass: Boolean(ej.theme_pass),
          topic_plan: topicPlan,
        });

        const pr = await fetch("/api/user/match-prefs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId: id, mode: "get" }),
        });
        const pj = await pr.json();
        if (pr.ok && pj?.prefs) {
          setPrefs({ min_age: pj.prefs.min_age, max_age: pj.prefs.max_age });
        }

        await reloadCatalog();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------- billing ----------
  async function buySlots(slotsTotal: 3 | 5) {
    if (!deviceId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, kind: "slots", slotsTotal }),
      });
      const j = await readJsonOrThrow(r);
      if (j?.url) window.location.href = j.url;
      else alert("checkout url missing");
    } catch (e: any) {
      alert(e?.message ?? "checkout_failed");
    } finally {
      setBusy(false);
    }
  }

  async function buyTopicPlan(amount: 400 | 800 | 1200) {
    if (!deviceId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, kind: "topic_plan", amount }),
      });
      const j = await readJsonOrThrow(r);
      if (j?.url) window.location.href = j.url;
      else alert("checkout url missing");
    } catch (e: any) {
      alert(e?.message ?? "checkout_failed");
    } finally {
      setBusy(false);
    }
  }

  // ---------- prefs ----------
  async function savePrefs(next: MatchPrefs) {
    if (!deviceId) return;
    setSavingPrefs(true);
    try {
      const r = await fetch("/api/user/match-prefs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          minAge: next.min_age,
          maxAge: next.max_age,
        }),
      });
      const j = await r.json();
      if (!r.ok) return alert(j?.error ?? "failed");
      setPrefs({ min_age: j.minAge, max_age: j.maxAge });
    } finally {
      setSavingPrefs(false);
    }
  }

  // ---------- topic price ----------
  const topicByKey = useMemo(() => {
    const m = new Map<string, Topic>();
    for (const t of topics) m.set(t.topic_key, t);
    return m;
  }, [topics]);

  function topicMonthlyPrice(topicKey: string | null): number {
    if (!topicKey) return 0;
    const t = topicByKey.get(topicKey);
    if (!t) return 0;
    if (typeof t.monthly_price === "number") return t.monthly_price;
    if (t.is_premium) return 1200;
    return 0;
  }

  function requiredMonthlyPriceForClass(c: ClassRow): number {
    const byTopic = topicMonthlyPrice(c.topic_key);
    if (byTopic > 0) return byTopic;
    if (c.is_premium) return 1200;
    return 0;
  }

  // ---------- filtering ----------
  const filtered = useMemo(() => {
    const maxA = Math.max(prefs.min_age, prefs.max_age);
    return classes.filter((c) => {
      if (c.is_sensitive && maxA < 18) return false;
      if (wFilter !== "all" && c.world_key !== wFilter) return false;
      if (tFilter !== "all" && c.topic_key !== tFilter) return false;
      return true;
    });
  }, [classes, prefs, wFilter, tFilter]);

  const isDefaultClass = (c: ClassRow) =>
    c.name === "ホームルーム" || c.name === "フリークラス";

  const defaultClass = useMemo(() => {
    const maxA = Math.max(prefs.min_age, prefs.max_age);
    return classes.find((c) => isDefaultClass(c) && !(c.is_sensitive && maxA < 18)) ?? null;
  }, [classes, prefs]);

  const boards = useMemo(
    () => filtered.filter((c) => !isDefaultClass(c)).sort((a, b) => a.name.localeCompare(b.name)),
    [filtered]
  );

  // ---------- access / transfer ----------
  const slots = ent?.class_slots ?? 1;
  const topicPlan = ent?.topic_plan ?? (ent?.theme_pass ? 1200 : 0);

  function hasTopicAccess(c: ClassRow): boolean {
    const need = requiredMonthlyPriceForClass(c);
    return need <= topicPlan;
  }

  async function doTransfer(c: ClassRow) {
    if (!deviceId) return;
    setBusy(true);
    try {
      if (!hasTopicAccess(c)) {
        setPendingClass(c);
        setNeedTopicOpen(true);
        return;
      }

      const r = await fetch("/api/class/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, newClassId: c.id }),
      });
      const j = await r.json();

      if (!r.ok) {
        if (j?.error === "class_slots_limit") {
          setPendingClass(c);
          setNeedSlotsOpen(true);
          return;
        }
        alert(j?.error ?? "failed");
        return;
      }

      window.location.href = "/call";
    } finally {
      setBusy(false);
    }
  }

  async function enterDefault() {
    if (!defaultClass) {
      alert("入口が見つかりません");
      return;
    }
    await doTransfer(defaultClass);
  }

  function BoardCard({ c }: { c: ClassRow }) {
    const need = requiredMonthlyPriceForClass(c);
    const locked = need > 0 && !hasTopicAccess(c);

    return (
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 14,
          background: "#fff",
          color: "#111",
          opacity: locked ? 0.7 : 1,
          filter: locked ? "grayscale(0.35)" : "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <strong style={{ fontSize: 15 }}>{c.name}</strong>
          <span style={{ fontSize: 12, opacity: 0.9 }}>
            {locked ? "🔒" : "🔓"} {c.is_sensitive ? "🔞" : "🟢"}
          </span>
        </div>

        <p style={{ marginTop: 10, whiteSpace: "pre-wrap", color: "#222", lineHeight: 1.5 }}>
          {c.description || "（説明なし）"}
        </p>

        <button
          onClick={() => doTransfer(c)}
          disabled={busy || loading}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: locked ? "#f3f3f3" : "#111",
            color: locked ? "#111" : "#fff",
            fontWeight: 900,
            cursor: busy || loading ? "not-allowed" : "pointer",
          }}
        >
          {locked ? `参加（要：${tierName(need)}以上）` : "参加する"}
        </button>

        {need > 0 ? (
          <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
            ※ “1テーマごと課金”ではありません。あなたの<strong>テーマプラン</strong>額以上がまとめて解放されます。
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto", color: "#111" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>入る</h1>
          <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>世界観/テーマで絞って参加</div>
        </div>

        <button
          onClick={() => (window.location.href = "/call")}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          通話へ
        </button>
      </header>

      <section style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Pill>クラス枠: {slots}</Pill>
        <Pill>テーマプラン: {tierName(topicPlan)}（¥{topicPlan}/月）</Pill>
        {loading ? <Pill>読み込み中…</Pill> : null}
        <button
          onClick={() => reloadCatalog()}
          disabled={loading}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          再読み込み
        </button>
      </section>

      {/* 年齢 */}
      <section style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 18, padding: 16, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <strong>年齢</strong>
          <span style={{ fontSize: 12, color: "#666" }}>
            {Math.min(prefs.min_age, prefs.max_age)}〜{Math.max(prefs.min_age, prefs.max_age)}歳
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <label style={{ fontSize: 12, color: "#666" }}>
            最小
            <input
              type="number"
              value={prefs.min_age}
              onChange={(e) => setPrefs((p) => ({ ...p, min_age: Number(e.target.value) }))}
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "#666" }}>
            最大
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
          disabled={savingPrefs || !deviceId || loading}
          style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, fontWeight: 900 }}
        >
          保存
        </button>
      </section>

      {/* 通常の入口 */}
      <section style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 18, padding: 16, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div>
            <strong style={{ fontSize: 16 }}>今すぐ入る</strong>
            <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>通常の入口</div>
          </div>

          <button
            onClick={enterDefault}
            disabled={busy || loading || !defaultClass}
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              cursor: busy || loading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            入る
          </button>
        </div>

        <button
          onClick={() => setShowNarrow((v) => !v)}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid #ccc",
            background: showNarrow ? "#111" : "#f6f6f6",
            color: showNarrow ? "#fff" : "#111",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {showNarrow ? "閉じる" : "世界観/テーマを選ぶ"}
        </button>
      </section>

      {showNarrow && (
        <>
          <section style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={wFilter} onChange={(e) => setWFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
              <option value="all">世界観: すべて</option>
              {worlds.map((w) => (
                <option key={w.world_key} value={w.world_key}>
                  {w.title} {w.is_sensitive ? "🔞" : ""}
                </option>
              ))}
            </select>

            <select value={tFilter} onChange={(e) => setTFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
              <option value="all">テーマ: すべて</option>
              {topics.map((t) => (
                <option key={t.topic_key} value={t.topic_key}>
                  {t.title} {t.is_sensitive ? "🔞" : ""} {t.monthly_price ? `（要:${tierName(t.monthly_price)}以上）` : ""}
                </option>
              ))}
            </select>
          </section>

          <section style={{ marginTop: 14 }}>
            <h2 style={{ margin: "10px 0", fontSize: 16, fontWeight: 900 }}>ボード</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {boards.map((c) => (
                <BoardCard key={c.id} c={c} />
              ))}
            </div>

            {boards.length === 0 && !loading ? (
              <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>条件に合うボードがありません</div>
            ) : null}
          </section>
        </>
      )}

      {/* ✅ 管理UI：?admin=1 の時だけ表示 */}
      {showAdminUI ? (
        <div style={{ marginTop: 18 }}>
          <AdminTopicEditor onPatched={() => reloadCatalog()} />
        </div>
      ) : null}

      <div style={{ height: 24 }} />
    </main>
  );
}
