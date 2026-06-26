// app/admin/topics/page.tsx
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { tierName } from "@/lib/planTiers";
import { genderRestrictionAdminLabel } from "@/lib/topicManagement";
import { DEFAULT_BILLING_NOTICE_TEXT } from "@/lib/billingNoticeDefaults";

type WorldRow = {
  world_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
};

type TopicRow = {
  topic_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
  monthly_price: number;
  gender_restriction?: string | null;
  is_archived: boolean;
  is_active?: boolean;
  is_paid?: boolean;
  display_order?: number;
  accepting_new_users?: boolean;
  badge_label?: string | null;
  created_at?: string;
  updated_at?: string;
  default_world_key?: string | null;
};

const PRICES = [0, 400, 800, 1200] as const;

async function readJsonOrThrow(r: Response) {
  const raw = await r.text();
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    console.error("Non-JSON response:", raw);
    throw new Error("non_json_response");
  }
  const j = JSON.parse(raw);
  if (!r.ok) throw new Error(j?.error ?? "request_failed");
  return j;
}

export default function AdminTopicsPage() {
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [worlds, setWorlds] = useState<WorldRow[]>([]);

  const [newKey, setNewKey] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState<number>(0);
  const [newSensitive, setNewSensitive] = useState(false);
  const [newMinAge, setNewMinAge] = useState(0);
  const [newWorldKey, setNewWorldKey] = useState<string>("");
  const [newGenderRestriction, setNewGenderRestriction] = useState<string>("");
  const [newIsActive, setNewIsActive] = useState(true);
  const [newIsPaid, setNewIsPaid] = useState(true);
  const [newDisplayOrder, setNewDisplayOrder] = useState(0);
  const [newAcceptingNewUsers, setNewAcceptingNewUsers] = useState(true);
  const [newBadgeLabel, setNewBadgeLabel] = useState("");

  const [wKey, setWKey] = useState("");
  const [wTitle, setWTitle] = useState("");
  const [wDesc, setWDesc] = useState("");
  const [wSensitive, setWSensitive] = useState(false);
  const [wMinAge, setWMinAge] = useState(0);

  const [globalJoinEnabled, setGlobalJoinEnabled] = useState(false);
const [globalJoinStart, setGlobalJoinStart] = useState("21:00");
const [globalJoinEnd, setGlobalJoinEnd] = useState("21:30");

const [billingNoticeEnabled, setBillingNoticeEnabled] = useState(true);
const [billingNoticeText, setBillingNoticeText] = useState(
  DEFAULT_BILLING_NOTICE_TEXT
);

type RecruitmentTtlMode = "5" | "10" | "15" | "unlimited";
const [recruitmentTtlMode, setRecruitmentTtlMode] =
  useState<RecruitmentTtlMode>("5");
const [minorsEnabled, setMinorsEnabled] = useState(false);
const [minorsRiskAck, setMinorsRiskAck] = useState(false);
const [productionAgeLocked, setProductionAgeLocked] = useState(false);

useEffect(() => {
  loadAll();
}, []);

  async function loadAll() {
    setBusy(true);
    setMsg("");
    try {
      const topicsRes = await fetch("/api/admin/topics", {
  method: "POST",
  credentials: "include",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    mode: "list",
    show_archived: true,
  }),
  cache: "no-store",
});
      const tj = await readJsonOrThrow(topicsRes);

      const worldsRes = await fetch("/api/admin/worlds", {
  method: "POST",
  credentials: "include",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    mode: "list",
  }),
  cache: "no-store",
});
      const wj = await readJsonOrThrow(worldsRes);

      setTopics(tj.topics ?? []);
      setWorlds(wj.worlds ?? []);
      const settingsRes = await fetch("/api/admin/settings", {
  method: "GET",
  credentials: "include",
  cache: "no-store",
});
const sj = await readJsonOrThrow(settingsRes);

const settings = sj.settings ?? {};

setGlobalJoinEnabled(Boolean(settings.global_join_window?.enabled));
setGlobalJoinStart(String(settings.global_join_window?.start ?? "21:00"));
setGlobalJoinEnd(String(settings.global_join_window?.end ?? "21:30"));

setBillingNoticeEnabled(Boolean(settings.billing_notice?.enabled));
setBillingNoticeText(
  String(settings.billing_notice?.text ?? DEFAULT_BILLING_NOTICE_TEXT)
);

const ttl = settings.recruitment_session_ttl_minutes ?? {};
if (ttl.unlimited === true) {
  setRecruitmentTtlMode("unlimited");
} else if (Number(ttl.minutes) === 10) {
  setRecruitmentTtlMode("10");
} else if (Number(ttl.minutes) === 15) {
  setRecruitmentTtlMode("15");
} else {
  setRecruitmentTtlMode("5");
}

setMinorsEnabled(settings.minors_enabled === true);
setProductionAgeLocked(Boolean(sj.production_age_locked));
      setMsg(
  `読み込みOK（topics:${(tj.topics ?? []).length} / worlds:${(wj.worlds ?? []).length} / settings:OK）`
);
    } catch (e: any) {
      setMsg(e?.message ?? "load_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
  setMsg("");
  setBusy(true);

  try {
    if (minorsEnabled && !minorsRiskAck) {
      setMsg("未成年許可を有効にする前に、下の確認チェックリストにチェックを入れてください。");
      setBusy(false);
      return;
    }

    const res = await fetch("/api/admin/settings", {
  method: "POST",
  credentials: "include",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    global_join_window: {
      enabled: globalJoinEnabled,
      start: globalJoinStart,
      end: globalJoinEnd,
    },
    billing_notice: {
      enabled: billingNoticeEnabled,
      text: billingNoticeText,
    },
    recruitment_session_ttl_minutes:
      recruitmentTtlMode === "unlimited"
        ? { unlimited: true, minutes: null }
        : { unlimited: false, minutes: Number(recruitmentTtlMode) },
    minors_enabled: minorsEnabled,
  }),
});

    await readJsonOrThrow(res);

    setMsg("全体設定を保存しました");
  } catch (e: any) {
    setMsg(e?.message ?? "settings_save_failed");
  } finally {
    setBusy(false);
  }
}

  async function addTopic() {
    setMsg("");
    setBusy(true);
    try {
      const topic_key = newKey.trim();
      const title = newTitle.trim();
      if (!topic_key) throw new Error("topic_key is required");
      if (!title) throw new Error("title is required");

      const res = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          topic: {
            topic_key,
            title,
            description: newDesc,
            monthly_price: Number(newPrice),
            is_sensitive: Boolean(newSensitive),
            min_age: Number(newMinAge),
            gender_restriction: newGenderRestriction || null,
            is_active: newIsActive,
            is_paid: newIsPaid,
            display_order: Number(newDisplayOrder),
            accepting_new_users: newAcceptingNewUsers,
            badge_label: newBadgeLabel.trim() || null,
          },
          default_world_key: newWorldKey ? newWorldKey : null,
        }),
      });
      await readJsonOrThrow(res);

      setNewKey("");
      setNewTitle("");
      setNewDesc("");
      setNewPrice(0);
      setNewSensitive(false);
      setNewMinAge(0);
      setNewWorldKey("");
      setNewGenderRestriction("");
      setNewIsActive(true);
      setNewIsPaid(true);
      setNewDisplayOrder(0);
      setNewAcceptingNewUsers(true);
      setNewBadgeLabel("");

      setMsg("追加OK");
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveTopic(t: TopicRow) {
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "update",
          topic_key: t.topic_key,
          patch: {
            title: t.title,
            description: t.description ?? "",
            monthly_price: Number(t.monthly_price ?? 0),
            is_sensitive: Boolean(t.is_sensitive),
            min_age: Number(t.min_age ?? 0),
            gender_restriction: t.gender_restriction ?? null,
            is_active: t.is_active !== false,
            is_paid: Boolean(t.is_paid),
            display_order: Number(t.display_order ?? 0),
            accepting_new_users: t.accepting_new_users !== false,
            badge_label: t.badge_label ?? null,
            default_world_key: t.default_world_key ?? null,
          },
        }),
      });
      await readJsonOrThrow(res);

      setMsg(`保存OK: ${t.topic_key}`);
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function archiveTopic(topic_key: string) {
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "archive", topic_key }),
      });
      await readJsonOrThrow(res);

      setMsg(`非表示OK: ${topic_key}`);
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "archive_failed");
    } finally {
      setBusy(false);
    }
  }

  async function unarchiveTopic(topic_key: string) {
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "unarchive", topic_key }),
      });
      await readJsonOrThrow(res);

      setMsg(`復活OK: ${topic_key}`);
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "unarchive_failed");
    } finally {
      setBusy(false);
    }
  }

  async function hardDeleteTopic(topic_key: string) {
    if (
      !confirm(
        `完全削除: ${topic_key}\n\n※ 先に非表示にしてから削除できます。\n本当に削除しますか？`
      )
    ) {
      return;
    }

    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "delete", topic_key }),
      });
      await readJsonOrThrow(res);

      setMsg(`削除OK: ${topic_key}`);
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "delete_failed");
    } finally {
      setBusy(false);
    }
  }

  async function addWorld() {
    setMsg("");
    setBusy(true);
    try {
      const world_key = wKey.trim();
      const title = wTitle.trim();
      if (!world_key) throw new Error("world_key is required");
      if (!title) throw new Error("world title is required");

      const res = await fetch("/api/admin/worlds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          world: {
            world_key,
            title,
            description: wDesc,
            is_sensitive: Boolean(wSensitive),
            min_age: Number(wMinAge),
          },
        }),
      });
      await readJsonOrThrow(res);

      setWKey("");
      setWTitle("");
      setWDesc("");
      setWSensitive(false);
      setWMinAge(0);

      setMsg("世界観 追加OK");
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "world_create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveWorld(w: WorldRow) {
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/worlds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "update",
          world_key: w.world_key,
          patch: {
            title: w.title,
            description: w.description ?? "",
            is_sensitive: Boolean(w.is_sensitive),
            min_age: Number(w.min_age ?? 0),
          },
        }),
      });
      await readJsonOrThrow(res);

      setMsg(`世界観 保存OK: ${w.world_key}`);
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "world_update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorld(world_key: string) {
    if (
      !confirm(
        `世界観を削除: ${world_key}\n\n※ その世界観がボードに使われている場合は削除できません。`
      )
    ) {
      return;
    }

    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/worlds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "delete", world_key }),
      });
      await readJsonOrThrow(res);

      setMsg(`世界観 削除OK: ${world_key}`);
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "world_delete_failed");
    } finally {
      setBusy(false);
    }
  }

  const publishedTopics = useMemo(
    () => topics.filter((t) => !t.is_archived && t.is_active !== false),
    [topics]
  );

  const unpublishedTopics = useMemo(
    () => topics.filter((t) => !t.is_archived && t.is_active === false),
    [topics]
  );

  const archivedTopics = useMemo(
    () => topics.filter((t) => t.is_archived),
    [topics]
  );

  const worldLabel = (key: string | null | undefined) => {
    if (!key) return "（未設定）";
    const w = worlds.find((x) => x.world_key === key);
    return w ? `${w.title} (${w.world_key})` : key;
  };

  const pageStyle: React.CSSProperties = {
    padding: 16,
    maxWidth: 1100,
    margin: "0 auto",
    color: "#111",
  };

  const card: React.CSSProperties = {
    border: "1px solid #ddd",
    borderRadius: 16,
    padding: 14,
    background: "#fff",
  };

  const input: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ccc",
    background: "#fff",
    outline: "none",
  };

  const btn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    fontWeight: 900,
    border: "1px solid #ccc",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  };

  const btnGhost: React.CSSProperties = {
    ...btn,
    background: "#fff",
    color: "#111",
  };

  const btnDanger: React.CSSProperties = {
    ...btn,
    background: "#fff",
    color: "#b00020",
    borderColor: "#f2b7c0",
  };

  return (
    <main style={pageStyle}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
        管理：世界観 / テーマ
      </h1>

      <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        世界観（worlds）は編集可能。テーマ（topics）には公開状態・受付状態・性別制限・表示順・価格を設定できます。
      </div>

      <section style={{ ...card, marginTop: 12 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            onClick={loadAll}
            disabled={busy}
            style={{ ...btn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "処理中…" : "読み込み"}
          </button>

          <button
            onClick={() => {
              window.location.href = "/admin";
            }}
            style={btnGhost}
          >
            管理トップへ
          </button>

          {msg ? <span style={{ fontSize: 12, color: "#333" }}>{msg}</span> : null}
        </div>
      </section>

            <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          入校受付時間
        </h2>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <label
            style={{
              fontSize: 13,
              display: "flex",
              gap: 8,
              alignItems: "center",
              gridColumn: "1 / -1",
            }}
          >
            <input
              type="checkbox"
              checked={globalJoinEnabled}
              onChange={(e) => setGlobalJoinEnabled(e.target.checked)}
            />
            入校受付時間を有効にする
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            受付開始
            <input
              type="time"
              value={globalJoinStart}
              onChange={(e) => setGlobalJoinStart(e.target.value)}
              style={{ ...input, width: "100%", marginTop: 6 }}
            />
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            受付終了
            <input
              type="time"
              value={globalJoinEnd}
              onChange={(e) => setGlobalJoinEnd(e.target.value)}
              style={{ ...input, width: "100%", marginTop: 6 }}
            />
          </label>

          <button
            onClick={saveSettings}
            disabled={busy}
            style={{
              ...btn,
              gridColumn: "1 / -1",
              opacity: busy ? 0.6 : 1,
            }}
          >
            入校受付時間を保存
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          募集締切（forming/waiting TTL）
        </h2>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#667085", lineHeight: 1.5 }}>
          通常「入る」の募集セッション有効時間。超過した forming/waiting は募集停止（expired）扱いになります。
        </p>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {(
            [
              { value: "5", label: "5分" },
              { value: "10", label: "10分" },
              { value: "15", label: "15分" },
              { value: "unlimited", label: "無制限" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              style={{
                fontSize: 13,
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 12,
                border:
                  recruitmentTtlMode === opt.value
                    ? "2px solid #111827"
                    : "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="recruitmentTtlMode"
                checked={recruitmentTtlMode === opt.value}
                onChange={() => setRecruitmentTtlMode(opt.value)}
              />
              {opt.label}
            </label>
          ))}

          <button
            onClick={saveSettings}
            disabled={busy}
            style={{
              ...btn,
              gridColumn: "1 / -1",
              opacity: busy ? 0.6 : 1,
            }}
          >
            募集締切設定を保存
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          課金ページの注意文
        </h2>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#667085", lineHeight: 1.5 }}>
          プラン画面・支払い管理画面の「?」ヘルプに表示されます。ベータ期間中の案内などをここで編集できます。
        </p>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <label
            style={{
              fontSize: 13,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={billingNoticeEnabled}
              onChange={(e) => setBillingNoticeEnabled(e.target.checked)}
            />
            課金ページに表示する
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            表示文言
            <textarea
              value={billingNoticeText}
              onChange={(e) => setBillingNoticeText(e.target.value)}
              rows={5}
              style={{
                ...input,
                width: "100%",
                marginTop: 6,
                resize: "vertical",
                lineHeight: 1.6,
              }}
            />
          </label>

          <button
            onClick={saveSettings}
            disabled={busy}
            style={{
              ...btn,
              width: "fit-content",
              opacity: busy ? 0.6 : 1,
            }}
          >
            課金注意文を保存
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
            未成年登録
          </h2>
          <span
            style={{
              display: "inline-flex",
              padding: "4px 10px",
              borderRadius: 999,
              background: minorsEnabled ? "#dbeafe" : "#f3f4f6",
              color: minorsEnabled ? "#1d4ed8" : "#374151",
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            {minorsEnabled ? "未成年登録 ON" : "未成年登録 OFF"}
          </span>
        </div>

        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#667085", lineHeight: 1.5 }}>
          18歳未満のプロフィール登録を許可します。本番初期運用ではOFF推奨。
          {productionAgeLocked ? " 現在の環境では本番二重ロックにより保存できません。" : ""}
        </p>

        {minorsEnabled ? (
          <label
            style={{
              marginTop: 10,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 12,
              color: "#b45309",
              fontWeight: 800,
            }}
          >
            <input
              type="checkbox"
              checked={minorsRiskAck}
              onChange={(e) => setMinorsRiskAck(e.target.checked)}
            />
            <span>
              未成年許可は検証環境専用であること、法務確認が必要であること、成人/未成年分離と通報強化が必要であることを理解しました。
            </span>
          </label>
        ) : null}

        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 800, color: "#374151" }}>
            {minorsEnabled ? "未成年登録：許可中" : "未成年登録：停止中"}
          </div>

          <label
            style={{
              fontSize: 13,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={minorsEnabled}
              onChange={(e) => {
                setMinorsEnabled(e.target.checked);
                if (!e.target.checked) setMinorsRiskAck(false);
              }}
            />
            18歳未満のプロフィール登録を許可する
          </label>

          <button
            onClick={saveSettings}
            disabled={busy}
            style={{
              ...btn,
              width: "fit-content",
              opacity: busy ? 0.6 : 1,
            }}
          >
            未成年登録設定を保存
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          世界観（worlds）
        </h2>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <input
            value={wKey}
            onChange={(e) => setWKey(e.target.value)}
            placeholder="world_key (例: hobby)"
            style={input}
          />

          <input
            value={wTitle}
            onChange={(e) => setWTitle(e.target.value)}
            placeholder="title (表示名)"
            style={input}
          />

          <input
            value={wDesc}
            onChange={(e) => setWDesc(e.target.value)}
            placeholder="description（任意）"
            style={{ ...input, gridColumn: "1 / -1" }}
          />

          <label style={{ fontSize: 12, color: "#666" }}>
            min_age
            <input
              type="number"
              value={wMinAge}
              onChange={(e) => setWMinAge(Number(e.target.value))}
              style={{ ...input, width: "100%", marginTop: 6 }}
            />
          </label>

          <label
            style={{
              fontSize: 12,
              color: "#666",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={wSensitive}
              onChange={(e) => setWSensitive(e.target.checked)}
            />
            is_sensitive（18+相当）
          </label>

          <button
            onClick={addWorld}
            disabled={busy}
            style={{
              ...btn,
              gridColumn: "1 / -1",
              opacity: busy ? 0.6 : 1,
            }}
          >
            世界観を追加
          </button>
        </div>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 900,
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>world_key</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>title</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>description</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>18+</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>min_age</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>操作</th>
              </tr>
            </thead>

            <tbody>
              {worlds.map((w) => (
                <tr key={w.world_key} style={{ borderBottom: "1px solid #f3f3f3" }}>
                  <td
                    style={{
                      padding: "8px 6px",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    {w.world_key}
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={w.title}
                      onChange={(e) =>
                        setWorlds((prev) =>
                          prev.map((x) =>
                            x.world_key === w.world_key
                              ? { ...x, title: e.target.value }
                              : x
                          )
                        )
                      }
                      style={{ ...input, padding: "6px 8px", width: 200 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={w.description ?? ""}
                      onChange={(e) =>
                        setWorlds((prev) =>
                          prev.map((x) =>
                            x.world_key === w.world_key
                              ? { ...x, description: e.target.value }
                              : x
                          )
                        )
                      }
                      style={{ ...input, padding: "6px 8px", width: 360 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(w.is_sensitive)}
                      onChange={(e) =>
                        setWorlds((prev) =>
                          prev.map((x) =>
                            x.world_key === w.world_key
                              ? { ...x, is_sensitive: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="number"
                      value={Number(w.min_age ?? 0)}
                      onChange={(e) =>
                        setWorlds((prev) =>
                          prev.map((x) =>
                            x.world_key === w.world_key
                              ? { ...x, min_age: Number(e.target.value) }
                              : x
                          )
                        )
                      }
                      style={{ ...input, padding: "6px 8px", width: 90 }}
                    />
                  </td>

                  <td
                    style={{
                      padding: "8px 6px",
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => saveWorld(w)}
                      disabled={busy}
                      style={{
                        ...btn,
                        padding: "8px 10px",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      保存
                    </button>

                    <button
                      onClick={() => deleteWorld(w.world_key)}
                      disabled={busy}
                      style={{
                        ...btnDanger,
                        padding: "8px 10px",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}

              {worlds.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10, color: "#666" }}>
                    世界観がありません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          新しいテーマを追加
        </h2>

        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          topic_key は英数字と _ 推奨（例: movie_anime）
        </div>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="topic_key"
            style={input}
          />

          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="タイトル"
            style={input}
          />

          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="説明（任意）"
            style={{ ...input, gridColumn: "1 / -1" }}
          />

          <label style={{ fontSize: 12, color: "#666" }}>
            月額（ティア）
            <select
              value={newPrice}
              onChange={(e) => setNewPrice(Number(e.target.value))}
              style={{ ...input, width: "100%", marginTop: 6 }}
            >
              {PRICES.map((p) => (
                <option key={p} value={p}>
                  {p}（{tierName(p)}）
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            性別制限
            <select
              value={newGenderRestriction}
              onChange={(e) => setNewGenderRestriction(e.target.value)}
              style={{ ...input, width: "100%", marginTop: 6 }}
            >
              <option value="">制限なし</option>
              <option value="male">男性のみ</option>
              <option value="female">女性のみ</option>
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            min_age
            <input
              type="number"
              value={newMinAge}
              onChange={(e) => setNewMinAge(Number(e.target.value))}
              style={{ ...input, width: "100%", marginTop: 6 }}
            />
          </label>

          <label
            style={{
              fontSize: 12,
              color: "#666",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={newSensitive}
              onChange={(e) => setNewSensitive(e.target.checked)}
            />
            sensitive（18+相当）
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            表示順
            <input
              type="number"
              value={newDisplayOrder}
              onChange={(e) => setNewDisplayOrder(Number(e.target.value))}
              style={{ ...input, width: "100%", marginTop: 6 }}
            />
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            バッジ文言（任意）
            <input
              value={newBadgeLabel}
              onChange={(e) => setNewBadgeLabel(e.target.value)}
              placeholder="例: 準備中"
              style={{ ...input, width: "100%", marginTop: 6 }}
            />
          </label>

          <label
            style={{
              fontSize: 12,
              color: "#666",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={newIsActive}
              onChange={(e) => setNewIsActive(e.target.checked)}
            />
            公開（課金ページ等に表示）
          </label>

          <label
            style={{
              fontSize: 12,
              color: "#666",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={newIsPaid}
              onChange={(e) => setNewIsPaid(e.target.checked)}
            />
            課金対象テーマ
          </label>

          <label
            style={{
              fontSize: 12,
              color: "#666",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={newAcceptingNewUsers}
              onChange={(e) => setNewAcceptingNewUsers(e.target.checked)}
            />
            新規受付 ON
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            世界観（割当）
            <select
              value={newWorldKey}
              onChange={(e) => setNewWorldKey(e.target.value)}
              style={{ ...input, width: "100%", marginTop: 6 }}
            >
              <option value="">（未設定 / null）</option>
              {worlds.map((w) => (
                <option key={w.world_key} value={w.world_key}>
                  {w.title} ({w.world_key})
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={addTopic}
            disabled={busy}
            style={{
              ...btn,
              gridColumn: "1 / -1",
              opacity: busy ? 0.6 : 1,
            }}
          >
            追加
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          公開中のテーマ
        </h2>

        <div style={{ marginTop: 8, fontSize: 12, color: "#666", lineHeight: 1.5 }}>
          公開 ON のテーマだけ、クラス選択・課金ページなどに表示されます。公開 OFF にしたテーマは下の「非公開」へ移ります。完全に隠す場合は「非表示にする」（アーカイブ）を使ってください。
        </div>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 1650,
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>topic_key</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>タイトル</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>世界観</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>月額</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>性別制限</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>表示順</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>公開</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>課金</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>新規受付</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>バッジ</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>18+</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>min_age</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>説明</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>操作</th>
              </tr>
            </thead>

            <tbody>
              {publishedTopics.map((t) => (
                <tr key={t.topic_key} style={{ borderBottom: "1px solid #f3f3f3" }}>
                  <td
                    style={{
                      padding: "8px 6px",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    {t.topic_key}
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={t.title}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, title: e.target.value }
                              : x
                          )
                        )
                      }
                      style={{ ...input, padding: "6px 8px", width: 180 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={t.default_world_key ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, default_world_key: v }
                              : x
                          )
                        );
                      }}
                      style={{ ...input, padding: "6px 8px", width: 210 }}
                    >
                      <option value="">（未設定 / null）</option>
                      {worlds.map((w) => (
                        <option key={w.world_key} value={w.world_key}>
                          {w.title} ({w.world_key})
                        </option>
                      ))}
                    </select>

                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                      現在: {worldLabel(t.default_world_key)}
                    </div>
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={Number(t.monthly_price ?? 0)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, monthly_price: v }
                              : x
                          )
                        );
                      }}
                      style={{ ...input, padding: "6px 8px" }}
                    >
                      {PRICES.map((p) => (
                        <option key={p} value={p}>
                          {p}（{tierName(p)}）
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={t.gender_restriction ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, gender_restriction: v }
                              : x
                          )
                        );
                      }}
                      style={{ ...input, padding: "6px 8px", width: 120 }}
                    >
                      <option value="">制限なし</option>
                      <option value="male">男性のみ</option>
                      <option value="female">女性のみ</option>
                    </select>

                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                      現在: {genderRestrictionAdminLabel(t.gender_restriction)}
                    </div>
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="number"
                      value={Number(t.display_order ?? 0)}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, display_order: Number(e.target.value) }
                              : x
                          )
                        )
                      }
                      style={{ ...input, padding: "6px 8px", width: 70 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="checkbox"
                      checked={t.is_active !== false}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, is_active: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(t.is_paid)}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, is_paid: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="checkbox"
                      checked={t.accepting_new_users !== false}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, accepting_new_users: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={t.badge_label ?? ""}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, badge_label: e.target.value }
                              : x
                          )
                        )
                      }
                      placeholder="任意"
                      style={{ ...input, padding: "6px 8px", width: 120 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(t.is_sensitive)}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, is_sensitive: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="number"
                      value={Number(t.min_age ?? 0)}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, min_age: Number(e.target.value) }
                              : x
                          )
                        )
                      }
                      style={{ ...input, padding: "6px 8px", width: 80 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={t.description ?? ""}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, description: e.target.value }
                              : x
                          )
                        )
                      }
                      style={{ ...input, padding: "6px 8px", width: 260 }}
                    />
                  </td>

                  <td
                    style={{
                      padding: "8px 6px",
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => saveTopic(t)}
                      disabled={busy}
                      style={{
                        ...btn,
                        padding: "8px 10px",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      保存
                    </button>

                    <button
                      onClick={() => archiveTopic(t.topic_key)}
                      disabled={busy}
                      style={{
                        ...btnGhost,
                        padding: "8px 10px",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      非表示にする
                    </button>
                  </td>
                </tr>
              ))}

              {publishedTopics.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ padding: 10, color: "#666" }}>
                    公開中のテーマがありません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {unpublishedTopics.length > 0 ? (
        <section style={{ ...card, marginTop: 12, borderColor: "#e5e7eb" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#374151" }}>
            非公開のテーマ（公開 OFF）
          </h2>
          <div style={{ marginTop: 8, fontSize: 12, color: "#666", lineHeight: 1.5 }}>
            ユーザー向け画面には出ません。公開に戻すにはチェックを ON にして保存してください。
          </div>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: 900,
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>topic_key</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>タイトル</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>性別制限</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>公開</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {unpublishedTopics.map((t) => (
                  <tr key={t.topic_key} style={{ borderBottom: "1px solid #f3f3f3" }}>
                    <td
                      style={{
                        padding: "8px 6px",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {t.topic_key}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{t.title}</td>
                    <td style={{ padding: "8px 6px" }}>
                      {genderRestrictionAdminLabel(t.gender_restriction)}
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <input
                        type="checkbox"
                        checked={t.is_active !== false}
                        onChange={(e) =>
                          setTopics((prev) =>
                            prev.map((x) =>
                              x.topic_key === t.topic_key
                                ? { ...x, is_active: e.target.checked }
                                : x
                            )
                          )
                        }
                      />
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => saveTopic(t)}
                          disabled={busy}
                          style={{
                            ...btn,
                            padding: "8px 10px",
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          保存
                        </button>
                        <button
                          onClick={() => archiveTopic(t.topic_key)}
                          disabled={busy}
                          style={{
                            ...btnGhost,
                            padding: "8px 10px",
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          非表示にする
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section style={{ ...card, marginTop: 12, borderColor: "#f2b7c0" }}>
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 900,
            color: "#b00020",
          }}
        >
          非表示のテーマ（復活 / 完全削除）
        </h2>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 1050,
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #f3d6db" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>topic_key</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>タイトル</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>世界観</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>月額</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>性別制限</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>操作</th>
              </tr>
            </thead>

            <tbody>
              {archivedTopics.map((t) => (
                <tr key={t.topic_key} style={{ borderBottom: "1px solid #f8e6ea" }}>
                  <td
                    style={{
                      padding: "8px 6px",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    {t.topic_key}
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={t.title}
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, title: e.target.value }
                              : x
                          )
                        )
                      }
                      style={{ ...input, padding: "6px 8px", width: 200 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={t.default_world_key ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, default_world_key: v }
                              : x
                          )
                        );
                      }}
                      style={{ ...input, padding: "6px 8px", width: 210 }}
                    >
                      <option value="">（未設定 / null）</option>
                      {worlds.map((w) => (
                        <option key={w.world_key} value={w.world_key}>
                          {w.title} ({w.world_key})
                        </option>
                      ))}
                    </select>

                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                      現在: {worldLabel(t.default_world_key)}
                    </div>
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={Number(t.monthly_price ?? 0)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, monthly_price: v }
                              : x
                          )
                        );
                      }}
                      style={{ ...input, padding: "6px 8px" }}
                    >
                      {PRICES.map((p) => (
                        <option key={p} value={p}>
                          {p}（{tierName(p)}）
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={t.gender_restriction ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setTopics((prev) =>
                          prev.map((x) =>
                            x.topic_key === t.topic_key
                              ? { ...x, gender_restriction: v }
                              : x
                          )
                        );
                      }}
                      style={{ ...input, padding: "6px 8px", width: 120 }}
                    >
                      <option value="">制限なし</option>
                      <option value="male">男性のみ</option>
                      <option value="female">女性のみ</option>
                    </select>

                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                      現在: {genderRestrictionAdminLabel(t.gender_restriction)}
                    </div>
                  </td>

                  <td
                    style={{
                      padding: "8px 6px",
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => saveTopic(t)}
                      disabled={busy}
                      style={{
                        ...btn,
                        padding: "8px 10px",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      保存
                    </button>

                    <button
                      onClick={() => unarchiveTopic(t.topic_key)}
                      disabled={busy}
                      style={{
                        ...btnGhost,
                        padding: "8px 10px",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      復活
                    </button>

                    <button
                      onClick={() => hardDeleteTopic(t.topic_key)}
                      disabled={busy}
                      style={{
                        ...btnDanger,
                        padding: "8px 10px",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      完全削除
                    </button>
                  </td>
                </tr>
              ))}

              {archivedTopics.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10, color: "#666" }}>
                    非表示のテーマがありません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ height: 24 }} />
    </main>
  );
}