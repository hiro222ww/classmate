"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { pushRecentClass } from "@/lib/recentClasses";
import { DevModeSwitcher } from "@/components/DevModeSwitcher";
import { isDevFeatureEnabled } from "@/lib/devMode";

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

type ProfileApiResponse = {
  ok?: boolean;
  profile?: Profile | null;
  error?: string;
  message?: string;
};

type EntryBoard = {
  key: string;
  title: string;
  description: string;
  world_key: string | null;
  topic_key: string | null;
  is_sensitive: boolean;
  monthly_price: number;
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

    if (err === "manual_override_enabled") {
      console.warn(`[${label}] manual_override_enabled`);
      return j;
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

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

export default function SelectClient() {
  console.log("🔥 NEW VERSION LOADED");

  const searchParams = useSearchParams();
  const dev = (searchParams.get("dev") ?? "").trim();
  const devQuery = dev ? `dev=${encodeURIComponent(dev)}` : "";

  const withDev = (path: string) => {
    if (!devQuery) return path;
    return `${path}${path.includes("?") ? "&" : "?"}${devQuery}`;
  };

  const [deviceId, setDeviceId] = useState("");

  const [worlds, setWorlds] = useState<World[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [, setClasses] = useState<ClassRow[]>([]);

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
  const [profile, setProfile] = useState<Profile | null>(null);

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

      const rawText = await r.text().catch(() => "");
      let raw: ProfileApiResponse | null = null;

      try {
        raw = rawText ? (JSON.parse(rawText) as ProfileApiResponse) : null;
      } catch {
        raw = null;
      }

      if (!r.ok || !raw?.ok) {
        console.warn("[class/select] profile fetch not ok", {
          requestedDeviceId: id,
          status: r.status,
          rawText,
          raw,
          dev,
        });
        setHasProfile(false);
        setProfile(null);
        return null;
      }

      const nextProfile: Profile | null = raw?.profile ?? null;

      const exists =
        !!safeTrim(nextProfile?.device_id) &&
        !!safeTrim(nextProfile?.display_name) &&
        !!safeTrim(nextProfile?.birth_date) &&
        !!safeTrim(nextProfile?.gender);

      setHasProfile(exists);
      setProfile(nextProfile);

      console.log("[class/select] profile =", {
        requestedDeviceId: id,
        returnedDeviceId: nextProfile?.device_id ?? null,
        displayName: nextProfile?.display_name ?? null,
        hasProfile: exists,
        dev,
      });

      return nextProfile;
    } catch (e) {
      console.error("[class/select] profile fetch failed", e);
      setHasProfile(false);
      setProfile(null);
      return null;
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

    console.log("[class/select] entitlements =", {
      deviceId: id,
      entitlements: next,
    });

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
      if (sj?.error === "billing_customer_missing") return sj;
      if (sj?.reason === "manual_override_enabled") return sj;

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
    let alive = true;

    const init = async () => {
      const id = getDeviceId();

      console.log("[class/select] init start", {
        dev,
        deviceId: id,
        href: typeof window !== "undefined" ? window.location.href : "",
      });

      if (!alive) return;

      setLoading(true);
      setBusy(false);
      setJoinLimitMessage("");
      setDeviceId(id);
      setHasProfile(null);
      setProfile(null);
      setEnt(null);
      setPrefs({ min_age: 18, max_age: 25 });
      setWorlds([]);
      setTopics([]);
      setClasses([]);

      try {
        const sp = new URLSearchParams(window.location.search);
        const paid = sp.get("paid");
        const sessionId = sp.get("session_id");

        console.log("[class/select] params", {
          paid,
          sessionId,
          deviceId: id,
          dev,
        });

        await fetchProfile(id);
        if (!alive) return;

        await fetchEntitlements(id);
        if (!alive) return;

        if (paid === "1" && sessionId) {
          try {
            await finalizeFromSession(id, sessionId);
            if (!alive) return;

            const firstSync = await syncBilling(id);
            if (!alive) return;

            await fetchEntitlements(id);
            if (!alive) return;

            await sleep(1200);
            if (!alive) return;

            const secondSync = await syncBilling(id);
            if (!alive) return;

            await fetchEntitlements(id);
            if (!alive) return;

            console.log("[class/select] finalize sync results =", {
              firstSync,
              secondSync,
            });

            sp.delete("paid");
            sp.delete("session_id");
            const qs = sp.toString();
            const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
            window.history.replaceState({}, "", newUrl);
          } catch (e) {
            console.error("[class/select] finalize flow failed", e);

            const syncResult = await syncBilling(id);
            if (!alive) return;

            await sleep(800);
            if (!alive) return;

            await fetchEntitlements(id);
            if (!alive) return;

            console.log("[class/select] finalize fallback syncResult =", syncResult);
          }
        } else {
          const syncResult = await syncBilling(id);
          if (!alive) return;

          await fetchEntitlements(id);
          if (!alive) return;

          console.log("[class/select] syncResult =", syncResult);
        }

        const pr = await fetch("/api/user/match-prefs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId: id, mode: "get" }),
          cache: "no-store",
        });

        try {
          const raw = await pr.text();
          let pj: any = null;

          try {
            pj = raw ? JSON.parse(raw) : null;
          } catch {
            pj = null;
          }

          if (pr.ok && pj?.prefs) {
            if (!alive) return;

            setPrefs({
              min_age: Number(pj.prefs.min_age ?? 18),
              max_age: Number(pj.prefs.max_age ?? 25),
            });
          } else {
            console.warn("[class/select] match-prefs get skipped", {
              status: pr.status,
              body: pj,
              raw,
              deviceId: id,
            });
          }
        } catch (e) {
          console.warn("[class/select] match-prefs get failed (non-fatal)", e);
        }

        if (!alive) return;
        await reloadCatalog();
      } catch (e: any) {
        console.error(e);
        if (alive) {
          alert(e?.message ?? "load_failed");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void init();

    return () => {
      alive = false;
    };
  }, [dev]);

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
        cache: "no-store",
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

  const slots = ent?.class_slots ?? 1;
  const topicPlan = ent?.topic_plan ?? (ent?.theme_pass ? 1200 : 0);

  const boards = useMemo<EntryBoard[]>(() => {
    const maxA = Math.max(prefs.min_age, prefs.max_age);
    const result: EntryBoard[] = [];

    if ((wFilter === "all" || wFilter === "default") && tFilter === "all") {
      result.push({
        key: "free",
        title: "フリー",
        description: "まずは気軽に入れる無料テーマ",
        world_key: "default",
        topic_key: null,
        is_sensitive: false,
        monthly_price: 0,
      });
    }

    for (const t of topics) {
      if (t.is_sensitive && maxA < 18) continue;
      if (wFilter !== "all" && wFilter !== "default") continue;
      if (tFilter !== "all" && t.topic_key !== tFilter) continue;

      result.push({
        key: t.topic_key,
        title: t.title,
        description: t.description || "このテーマで話せる入口",
        world_key: "default",
        topic_key: t.topic_key,
        is_sensitive: t.is_sensitive,
        monthly_price:
          typeof t.monthly_price === "number"
            ? t.monthly_price
            : t.is_premium
              ? 1200
              : 0,
      });
    }

    return result.sort((a, b) => {
      if (a.monthly_price !== b.monthly_price) {
        return a.monthly_price - b.monthly_price;
      }
      return a.title.localeCompare(b.title);
    });
  }, [topics, prefs, wFilter, tFilter]);

  function hasBoardAccess(b: EntryBoard): boolean {
    return b.monthly_price <= topicPlan;
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
      window.location.href = withDev("/profile");
    }

    return true;
  }

  async function joinMatchedBoard(b: EntryBoard, forcedClassId?: string) {
    console.log("[select] clicked board =", b, "forcedClassId =", forcedClassId);

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
      if (!hasBoardAccess(b)) {
        alert(
          `このボードは ${tierName(b.monthly_price)}（¥${b.monthly_price}/月）以上が必要です`
        );
        return;
      }

      const displayName = safeTrim(profile?.display_name);

      if (!displayName) {
        goProfileIfNeeded("profile_required");
        return;
      }

      const matchRes = await fetch("/api/class/match-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          topicKey: b.topic_key,
          worldKey: b.world_key ?? "default",
          capacity: 5,
          preferJoinedClass: false,
          classId: forcedClassId ?? undefined,
          minAge: Math.min(prefs.min_age, prefs.max_age),
          maxAge: Math.max(prefs.min_age, prefs.max_age),
        }),
        cache: "no-store",
      });

      const matchRaw = await matchRes.text();
      let matchJson: any = {};
      try {
        matchJson = matchRaw ? JSON.parse(matchRaw) : {};
      } catch {
        throw new Error("non_json_response");
      }

      console.log("[select] match-join response =", matchJson);

      if (!matchRes.ok || !matchJson?.ok) {
        if (matchJson?.error === "profile_required") {
          goProfileIfNeeded(matchJson?.error);
          return;
        }

        if (matchJson?.error === "class_slots_limit") {
          setSlotsLimitUi(matchJson?.classSlots);
          return;
        }

        alert(matchJson?.error ?? "match_join_failed");
        return;
      }

      const classId = safeTrim(matchJson?.classId);
      const sessionId = safeTrim(matchJson?.sessionId);

      if (!classId || !sessionId) {
        throw new Error("match_join_missing_ids");
      }

      const joinRes = await fetch("/api/session/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          classId,
          deviceId,
          name: displayName,
          capacity: 5,
        }),
        cache: "no-store",
      });

      const joinRaw = await joinRes.text();
      let joinJson: any = {};
      try {
        joinJson = joinRaw ? JSON.parse(joinRaw) : {};
      } catch {
        throw new Error("non_json_response");
      }

      console.log("[select] session/join response =", joinJson);

      if (!joinRes.ok || !joinJson?.ok) {
        alert(joinJson?.error ?? "session_join_failed");
        return;
      }

      const roomUrl =
        `/room?autojoin=1&classId=${encodeURIComponent(classId)}` +
        `&sessionId=${encodeURIComponent(sessionId)}` +
        (devQuery ? `&${devQuery}` : "");

      pushRecentClass(
        {
          id: classId,
          title: b.title,
          url: roomUrl,
        },
        20
      );

      window.location.href = roomUrl;
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "enter_board_failed");
    } finally {
      setBusy(false);
    }
  }

  async function enterQuickFreeTheme() {
    const freeBoard: EntryBoard = {
      key: "free",
      title: "フリー",
      description: "まずは気軽に入れる無料テーマ",
      world_key: "default",
      topic_key: null,
      is_sensitive: false,
      monthly_price: 0,
    };

    await joinMatchedBoard(freeBoard);
  }

  function BoardCard({ b }: { b: EntryBoard }) {
    const locked = !hasBoardAccess(b);
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
          <strong style={{ fontSize: 15 }}>{b.title}</strong>
          <span style={{ fontSize: 12, opacity: 0.9 }}>
            {profileMissing && "🧑未登録 "}
            {locked ? "🔒" : "🔓"} {b.is_sensitive ? "🔞" : "🟢"}
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
          {b.description || "（説明なし）"}
        </p>

        <button
          onClick={() => void joinMatchedBoard(b)}
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
              busy || loading || !deviceId || profileMissing
                ? "not-allowed"
                : "pointer",
          }}
        >
          {profileMissing
            ? "プロフィール登録が必要"
            : locked
              ? `参加（要：${tierName(b.monthly_price)}以上）`
              : "参加する"}
        </button>

        {b.monthly_price > 0 ? (
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

  const debugProfileDeviceId = profile?.device_id ?? "-";
  const debugDisplayName = profile?.display_name ?? "-";

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
         <h1
  style={{
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
    color: "#111",
    letterSpacing: 0.5,
  }}
>
  classmate
</h1>
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
            href={withDev("/profile")}
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
            href={withDev("/premium")}
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
            href={withDev("/billing")}
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

          {isDevFeatureEnabled() && (
            <Link
              href={withDev("/dev/console")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #f59e0b",
                background: "#fffbeb",
                fontWeight: 900,
                color: "#92400e",
                textDecoration: "none",
              }}
            >
              🧪 開発コンソール
            </Link>
          )}
        </div>
      </header>

      {isDevFeatureEnabled() && (
        <section
          style={{
            marginTop: 12,
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            color: "#92400e",
            borderRadius: 14,
            padding: 12,
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 4 }}>DEV STATUS</div>
          <div>dev: {dev || "-"}</div>
          <div>deviceId: {deviceId || "-"}</div>
          <div>profile.device_id: {debugProfileDeviceId}</div>
          <div>display_name: {debugDisplayName}</div>
        </section>
      )}

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
              href={withDev("/profile")}
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
              href={withDev("/")}
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
              href={withDev("/premium")}
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
          onClick={() => void reloadCatalog()}
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
              onChange={(e) =>
                setPrefs((p) => ({ ...p, min_age: Number(e.target.value) }))
              }
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "#666" }}>
            最大
            <input
              type="number"
              value={prefs.max_age}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, max_age: Number(e.target.value) }))
              }
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 6 }}
            />
          </label>
        </div>

        <button
          onClick={() => void savePrefs(prefs)}
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
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <Link
            href={withDev("/")}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "#f8f8f8",
              fontWeight: 900,
              color: "#111",
              textDecoration: "none",
            }}
          >
            今所属しているクラスを見る
          </Link>
        </div>

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
          </div>

          <button
            onClick={() => void enterQuickFreeTheme()}
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
              {boards.map((b) => (
                <BoardCard key={b.key} b={b} />
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
      <DevModeSwitcher />
    </main>
  );
}