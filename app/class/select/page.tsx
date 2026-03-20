"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getOrCreateDeviceId } from "@/lib/device";
import { pushRecentClass } from "@/lib/recentClasses";

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
  monthly_price?: number;
  is_premium?: boolean;
};

type ClassRow = {
  id: string;
  name: string;
  description: string;
  world_key: string | null;
  topic_key: string | null;
  min_age: number;
  is_sensitive: boolean;
  is_premium?: boolean;
  is_user_created: boolean;
  created_at?: string;
};

type MatchPrefs = { min_age: number; max_age: number };

type Entitlements = {
  plan: string;
  class_slots: number;
  can_create_classes: boolean;
  topic_plan?: number;
  theme_pass?: boolean;
};

type Profile = {
  device_id: string;
  display_name: string;
  birth_date: string;
  gender: "male" | "female";
  photo_path: string | null;
};

async function readJsonOrThrow(r: Response, label: string) {
  const raw = await r.text();
  let j: any = null;

  try {
    j = raw ? JSON.parse(raw) : null;
  } catch {
    console.error(`[${label}] non-json response`, {
      status: r.status,
      contentType: r.headers.get("content-type"),
      rawPreview: raw.slice(0, 300),
    });
    throw new Error("non_json_response");
  }

  if (!r.ok) {
    const err = j?.error ?? `${label}_failed_${r.status}`;
    const detail = j?.detail ? ` / ${j.detail}` : "";

    if (err === "billing_customer_missing") {
      console.warn(`[${label}] billing_customer_missing (non-fatal)`);
      return { ok: false, error: "billing_customer_missing" };
    }

    console.error(`[${label}] api error`, j);
    throw new Error(`${err}${detail}`);
  }

  return j;
}

function tierName(price: number) {
  if (price >= 1200) return "プレミアム";
  if (price >= 800) return "スタンダード";
  if (price >= 400) return "ベーシック";
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const [joinLimitMessage, setJoinLimitMessage] = useState("");

  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  async function reloadCatalog() {
    try {
      const r = await fetch("/api/class/list", { cache: "no-store" });
      const j = await readJsonOrThrow(r, "class_list");
      setWorlds(j.worlds ?? []);
      setClasses(j.classes ?? []);

      const tr = await fetch("/api/topics", { cache: "no-store" });
      const tj = await readJsonOrThrow(tr, "topics");
      setTopics(tj.topics ?? []);
    } catch (e) {
      console.error(e);
      setWorlds([]);
      setClasses([]);
      setTopics([]);
    }
  }

  async function fetchProfile(id: string) {
    try {
      const r = await fetch(`/api/profile?device_id=${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!r.ok) {
        setHasProfile(false);
        return false;
      }

      const data: Profile | null = await r.json();
      const exists = Boolean(data?.device_id);
      setHasProfile(exists);
      return exists;
    } catch (e) {
      console.error("[class/select] profile fetch failed", e);
      setHasProfile(false);
      return false;
    }
  }

  async function fetchEntitlements(id: string) {
    const er = await fetch("/api/user/entitlements", {
      method: "GET",
      headers: { "x-device-id": id },
      cache: "no-store",
    });
    const ej = await readJsonOrThrow(er, "entitlements");

    const topicPlan =
      typeof ej.topic_plan === "number"
        ? ej.topic_plan
        : Boolean(ej.theme_pass)
          ? 1200
          : 0;

    const next: Entitlements = {
      plan: ej.plan ?? "free",
      class_slots: ej.class_slots ?? 1,
      can_create_classes: ej.can_create_classes ?? false,
      theme_pass: Boolean(ej.theme_pass),
      topic_plan: topicPlan,
    };

    console.log("[class/select] entitlements =", next);
    setEnt(next);
    return next;
  }

  async function syncBilling(id: string) {
    const sr = await fetch("/api/billing/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": id,
      },
      body: JSON.stringify({ deviceId: id }),
      cache: "no-store",
    });

    try {
      const sj = await readJsonOrThrow(sr, "billing_sync");
      if (sj?.error === "billing_customer_missing") return null;
      console.log("[class/select] sync ok", sj);
      return sj;
    } catch (e) {
      console.error("[class/select] sync failed", e);
      return null;
    }
  }

  async function finalizeFromSession(id: string, sessionId: string) {
    const fr = await fetch("/api/billing/finalize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": id,
      },
      body: JSON.stringify({ session_id: sessionId, deviceId: id }),
      cache: "no-store",
    });

    const fj = await readJsonOrThrow(fr, "billing_finalize");
    console.log("[class/select] finalize ok", fj);
    return fj;
  }

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);

    (async () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const paid = sp.get("paid");
        const sessionId = sp.get("session_id");

        console.log("[class/select] params", { paid, sessionId, deviceId: id });

        await fetchProfile(id);
        await fetchEntitlements(id);

        if (paid === "1" && sessionId) {
          try {
            await finalizeFromSession(id, sessionId);
            await syncBilling(id);
            await fetchEntitlements(id);

            await sleep(1200);
            await syncBilling(id);
            await fetchEntitlements(id);

            sp.delete("paid");
            sp.delete("session_id");
            const qs = sp.toString();
            const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
            window.history.replaceState({}, "", newUrl);
          } catch (e) {
            console.error("[class/select] finalize flow failed", e);

            await syncBilling(id);
            await sleep(800);
            await fetchEntitlements(id);
          }
        } else {
          await syncBilling(id);
          await fetchEntitlements(id);
        }

        const pr = await fetch("/api/user/match-prefs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId: id, mode: "get" }),
          cache: "no-store",
        });

        try {
          const pj = await readJsonOrThrow(pr, "match_prefs_get");
          if (pj?.prefs) {
            setPrefs({ min_age: pj.prefs.min_age, max_age: pj.prefs.max_age });
          }
        } catch (e) {
          console.warn("[class/select] match-prefs get failed (non-fatal)", e);
        }

        await reloadCatalog();
      } catch (e: any) {
        console.error(e);
        alert(e?.message ?? "load_failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

      try {
        const j = await readJsonOrThrow(r, "match_prefs_save");
        setPrefs({ min_age: j.minAge, max_age: j.maxAge });
      } catch (e: any) {
        alert(e?.message ?? "failed");
      }
    } finally {
      setSavingPrefs(false);
    }
  }

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

  const filtered = useMemo(() => {
    const maxA = Math.max(prefs.min_age, prefs.max_age);
    return classes.filter((c) => {
      if (c.is_sensitive && maxA < 18) return false;
      if (wFilter !== "all" && c.world_key !== wFilter) return false;
      if (tFilter !== "all" && c.topic_key !== tFilter) return false;
      return true;
    });
  }, [classes, prefs, wFilter, tFilter]);

  const boards = useMemo(() => {
    const map = new Map<string, ClassRow>();

    for (const c of filtered) {
      const key = `${c.world_key ?? "default"}::${c.topic_key ?? "free"}`;
      if (!map.has(key)) {
        map.set(key, c);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const slots = ent?.class_slots ?? 1;
  const topicPlan = ent?.topic_plan ?? (ent?.theme_pass ? 1200 : 0);

  function hasTopicAccess(c: ClassRow): boolean {
    const need = requiredMonthlyPriceForClass(c);
    return need <= topicPlan;
  }

  function setSlotsLimitUi(classSlots?: number) {
    setJoinLimitMessage(
      `クラス参加上限に達しています。現在のプランでは最大 ${
        classSlots ?? slots
      } クラスまで参加できます。不要なクラスを抜けるか、プランを変更してください。`
    );
  }

  function goProfileIfNeeded(error?: string) {
    if (error && error !== "profile_required") return false;

    const ok = window.confirm(
      "クラスに参加するにはプロフィール登録が必要です。\nプロフィール登録ページへ移動しますか？"
    );

    if (ok) {
      window.location.href = "/profile";
    }

    return true;
  }

  async function doTransfer(c: ClassRow) {
    if (!deviceId) {
      alert("deviceId の取得中です。数秒後にもう一度押してください。");
      return;
    }

    if (hasProfile === false) {
      goProfileIfNeeded();
      return;
    }

    setBusy(true);
    setJoinLimitMessage("");

    try {
      if (!hasTopicAccess(c)) {
        const need = requiredMonthlyPriceForClass(c);
        alert(`このボードは ${tierName(need)}（¥${need}/月）以上が必要です`);
        return;
      }

      const res = await fetch("/api/class/match-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          topicKey: c.topic_key,
          worldKey: c.world_key ?? "default",
          capacity: 5,
          preferJoinedClass: c.topic_key ? true : false,
        }),
        cache: "no-store",
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error("non_json_response");
      }

      if (!res.ok || !j?.ok) {
        if (j?.error === "profile_required") {
          goProfileIfNeeded(j?.error);
          return;
        }

        if (j?.error === "class_slots_limit") {
          setSlotsLimitUi(j?.classSlots);
          return;
        }

        alert(j?.error ?? "match_join_failed");
        return;
      }

      if (!j?.classId) {
        alert("match_join_failed");
        return;
      }

      const roomUrl = `/room?autojoin=1&classId=${encodeURIComponent(j.classId)}`;

      pushRecentClass(
        {
          id: j.classId,
          title: j?.class?.name ?? c.name,
          url: roomUrl,
        },
        20
      );

      window.location.href = roomUrl;
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "join_failed");
    } finally {
      setBusy(false);
    }
  }

  async function enterQuickFreeTheme() {
    if (loading) return;
    if (!deviceId) {
      alert("deviceId の取得中です。数秒後にもう一度押してください。");
      return;
    }

    if (hasProfile === false) {
      goProfileIfNeeded();
      return;
    }

    setBusy(true);
    setJoinLimitMessage("");

    try {
      const res = await fetch("/api/class/match-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          topicKey: null,
          worldKey: "default",
          capacity: 5,
          preferJoinedClass: false,
        }),
        cache: "no-store",
      });

      const raw = await res.text();
      let json: any = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error("non_json_response");
      }

      if (!res.ok || !json?.ok) {
        if (json?.error === "profile_required") {
          goProfileIfNeeded(json?.error);
          return;
        }

        if (json?.error === "class_slots_limit") {
          setSlotsLimitUi(json?.classSlots);
          return;
        }

        alert(json?.error || "match_join_failed");
        return;
      }

      if (!json?.classId) {
        alert("match_join_failed");
        return;
      }

      window.location.href = `/room?autojoin=1&classId=${encodeURIComponent(json.classId)}`;
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "quick_join_failed");
    } finally {
      setBusy(false);
    }
  }

  function BoardCard({ c }: { c: ClassRow }) {
    const need = requiredMonthlyPriceForClass(c);
    const locked = need > 0 && !hasTopicAccess(c);
    const profileMissing = hasProfile === false;

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "baseline",
          }}
        >
          <strong style={{ fontSize: 15 }}>{c.name}</strong>
          <span style={{ fontSize: 12, opacity: 0.9 }}>
            {profileMissing && "🧑未登録 "}
            {locked ? "🔒" : "🔓"} {c.is_sensitive ? "🔞" : "🟢"}
          </span>
        </div>

        <p
          style={{
            marginTop: 10,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            color: "#222",
            lineHeight: 1.5,
          }}
        >
          {c.description || "（説明なし）"}
        </p>

        <button
          onClick={() => doTransfer(c)}
          disabled={busy || loading || !deviceId || profileMissing}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: profileMissing ? "#e5e5e5" : locked ? "#f3f3f3" : "#111",
            color: profileMissing ? "#666" : locked ? "#111" : "#fff",
            fontWeight: 900,
            cursor:
              busy || loading || !deviceId || profileMissing ? "not-allowed" : "pointer",
          }}
        >
          {profileMissing
            ? "プロフィール登録が必要"
            : locked
              ? `参加（要：${tierName(need)}以上）`
              : "参加する"}
        </button>

        {need > 0 ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "#666",
              lineHeight: 1.6,
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            ※ “1テーマごと課金”ではありません。あなたの<strong>テーマプラン</strong>額以上がまとめて解放されます。
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto", color: "#111" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>入る</h1>
          <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            世界観/テーマで絞って参加
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Link
            href="/profile"
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #4ade80",
              background: "#ecfdf5",
              fontWeight: 900,
              color: "#166534",
              textDecoration: "none",
            }}
          >
            プロフィール登録
          </Link>

          <Link
            href="/premium"
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "#fff",
              fontWeight: 900,
              color: "#111",
              textDecoration: "none",
            }}
          >
            プランを見る
          </Link>

          <Link
            href="/billing"
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "#fff",
              fontWeight: 900,
              color: "#111",
              textDecoration: "none",
            }}
          >
            お支払い・解約
          </Link>

          <Link
            href="/"
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "#fff",
              fontWeight: 900,
              color: "#111",
              textDecoration: "none",
            }}
          >
            今のクラス
          </Link>
        </div>
      </header>

      {hasProfile === false && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
            fontWeight: 800,
            lineHeight: 1.6,
          }}
        >
          クラスに参加するにはプロフィール登録が必要です。
          <div style={{ marginTop: 10 }}>
            <Link
              href="/profile"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #facc15",
                background: "#fff",
                color: "#92400e",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              プロフィール登録へ
            </Link>
          </div>
        </div>
      )}

      {joinLimitMessage ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            fontWeight: 800,
            lineHeight: 1.6,
          }}
        >
          {joinLimitMessage}
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #fca5a5",
                background: "#fff",
                color: "#991b1b",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              今のクラスを見る
            </Link>
            <Link
              href="/premium"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #fca5a5",
                background: "#fff",
                color: "#991b1b",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              プランを見る
            </Link>
          </div>
        </div>
      ) : null}

      <section
        style={{
          marginTop: 12,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
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

      <section
        style={{
          marginTop: 12,
          border: "1px solid #ddd",
          borderRadius: 18,
          padding: 16,
          background: "#fff",
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
          <strong>年齢</strong>
          <span style={{ fontSize: 12, color: "#666" }}>
            {Math.min(prefs.min_age, prefs.max_age)}〜{Math.max(prefs.min_age, prefs.max_age)}歳
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginTop: 10,
          }}
        >
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

      <section
        style={{
          marginTop: 14,
          border: "1px solid #ddd",
          borderRadius: 18,
          padding: 16,
          background: "#fff",
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
            <strong style={{ fontSize: 16 }}>今すぐ入る</strong>
            <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
              無料テーマ（考えずに入れる入口）
            </div>
          </div>

          <button
            onClick={enterQuickFreeTheme}
            disabled={busy || loading || !deviceId || hasProfile === false}
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              border: "none",
              background: hasProfile === false ? "#d4d4d4" : "#111",
              color: hasProfile === false ? "#666" : "#fff",
              fontWeight: 900,
              cursor:
                busy || loading || !deviceId || hasProfile === false
                  ? "not-allowed"
                  : "pointer",
              whiteSpace: "nowrap",
              opacity: busy || loading || !deviceId ? 0.6 : 1,
            }}
          >
            {hasProfile === false ? "プロフィール登録が必要" : "入る"}
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
          <section
            style={{
              marginTop: 12,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={wFilter}
              onChange={(e) => setWFilter(e.target.value)}
              style={{ padding: 10, borderRadius: 10 }}
            >
              <option value="all">世界観: すべて</option>
              {worlds.map((w) => (
                <option key={w.world_key} value={w.world_key}>
                  {w.title} {w.is_sensitive ? "🔞" : ""}
                </option>
              ))}
            </select>

            <select
              value={tFilter}
              onChange={(e) => setTFilter(e.target.value)}
              style={{ padding: 10, borderRadius: 10 }}
            >
              <option value="all">テーマ: すべて</option>
              {topics.map((t) => (
                <option key={t.topic_key} value={t.topic_key}>
                  {t.title} {t.is_sensitive ? "🔞" : ""}{" "}
                  {t.monthly_price ? `（要:${tierName(t.monthly_price)}以上）` : ""}
                </option>
              ))}
            </select>
          </section>

          <section style={{ marginTop: 14 }}>
            <h2 style={{ margin: "10px 0", fontSize: 16, fontWeight: 900 }}>ボード</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {boards.map((c) => (
                <BoardCard key={c.id} c={c} />
              ))}
            </div>

            {boards.length === 0 && !loading ? (
              <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                条件に合うボードがありません
              </div>
            ) : null}
          </section>
        </>
      )}

      <div style={{ height: 24 }} />
    </main>
  );
}