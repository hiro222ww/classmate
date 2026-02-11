// app/admin/topics/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

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
  is_archived: boolean;
  created_at?: string;
  default_world_key?: string | null; // listで付与
};

const PRICES = [0, 400, 800, 1200] as const;

function tierName(price: number) {
  if (price >= 1200) return "プレミアム";
  if (price >= 800) return "ミドル";
  if (price >= 400) return "ライト";
  return "無料";
}

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
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [worlds, setWorlds] = useState<WorldRow[]>([]);

  // topic add form
  const [newKey, setNewKey] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState<number>(0);
  const [newSensitive, setNewSensitive] = useState(false);
  const [newMinAge, setNewMinAge] = useState(0);
  const [newWorldKey, setNewWorldKey] = useState<string>(""); // "" => null

  // world add form
  const [wKey, setWKey] = useState("");
  const [wTitle, setWTitle] = useState("");
  const [wDesc, setWDesc] = useState("");
  const [wSensitive, setWSensitive] = useState(false);
  const [wMinAge, setWMinAge] = useState(0);

  const authed = useMemo(() => pass.trim().length > 0, [pass]);

  useEffect(() => {
    const saved = localStorage.getItem("ADMIN_PASSWORD");
    if (saved) setPass(saved);
  }, []);

  function savePass() {
    localStorage.setItem("ADMIN_PASSWORD", pass.trim());
  }

  async function loadAll() {
    if (!authed) return;
    setBusy(true);
    setMsg("");
    try {
      savePass();

      const topicsRes = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pass.trim(), mode: "list", show_archived: true }),
        cache: "no-store",
      });
      const tj = await readJsonOrThrow(topicsRes);

      const worldsRes = await fetch("/api/admin/worlds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pass.trim(), mode: "list" }),
        cache: "no-store",
      });
      const wj = await readJsonOrThrow(worldsRes);

      setTopics(tj.topics ?? []);
      setWorlds(wj.worlds ?? []);
      setMsg(`読み込みOK（topics:${(tj.topics ?? []).length} / worlds:${(wj.worlds ?? []).length}）`);
    } catch (e: any) {
      setMsg(e?.message ?? "load_failed");
    } finally {
      setBusy(false);
    }
  }

  // -------- topics actions --------
  async function addTopic() {
    setMsg("");
    setBusy(true);
    try {
      savePass();

      const topic_key = newKey.trim();
      const title = newTitle.trim();
      if (!topic_key) throw new Error("topic_key is required");
      if (!title) throw new Error("title is required");

      const res = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password: pass.trim(),
          mode: "create",
          topic: {
            topic_key,
            title,
            description: newDesc,
            monthly_price: Number(newPrice),
            is_sensitive: Boolean(newSensitive),
            min_age: Number(newMinAge),
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
      savePass();

      const res = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password: pass.trim(),
          mode: "update",
          topic_key: t.topic_key,
          patch: {
            title: t.title,
            description: t.description ?? "",
            monthly_price: Number(t.monthly_price ?? 0),
            is_sensitive: Boolean(t.is_sensitive),
            min_age: Number(t.min_age ?? 0),
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
        body: JSON.stringify({ password: pass.trim(), mode: "archive", topic_key }),
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
        body: JSON.stringify({ password: pass.trim(), mode: "unarchive", topic_key }),
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
    if (!confirm(`完全削除: ${topic_key}\n\n※ 先に非表示にしてから削除できます。\n本当に削除しますか？`)) return;

    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pass.trim(), mode: "delete", topic_key }),
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

  // -------- worlds actions --------
  async function addWorld() {
    setMsg("");
    setBusy(true);
    try {
      savePass();

      const world_key = wKey.trim();
      const title = wTitle.trim();
      if (!world_key) throw new Error("world_key is required");
      if (!title) throw new Error("world title is required");

      const res = await fetch("/api/admin/worlds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password: pass.trim(),
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
          password: pass.trim(),
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
    if (!confirm(`世界観を削除: ${world_key}\n\n※ その世界観がボードに使われている場合は削除できません。`)) return;

    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/worlds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pass.trim(), mode: "delete", world_key }),
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

  // -------- view models --------
  const visibleTopics = useMemo(() => topics.filter((t) => !t.is_archived), [topics]);
  const archivedTopics = useMemo(() => topics.filter((t) => t.is_archived), [topics]);

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
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>管理：世界観 / テーマ</h1>
      <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        世界観（worlds）は編集可能。テーマ（topics）には世界観を割り当て可能（ユーザー側の絞り込みが復活）。
      </div>

      <section style={{ ...card, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="ADMIN_PASSWORD" style={{ ...input, width: 260 }} />
          <button onClick={loadAll} disabled={!authed || busy} style={{ ...btn, opacity: !authed || busy ? 0.6 : 1 }}>
            {busy ? "処理中…" : "読み込み"}
          </button>
          <button onClick={() => (window.location.href = "/class/select")} style={btnGhost}>
            戻る
          </button>
          {msg ? <span style={{ fontSize: 12, color: "#333" }}>{msg}</span> : null}
        </div>
      </section>

      {/* Worlds */}
      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>世界観（worlds）</h2>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input value={wKey} onChange={(e) => setWKey(e.target.value)} placeholder="world_key (例: hobby)" style={input} />
          <input value={wTitle} onChange={(e) => setWTitle(e.target.value)} placeholder="title (表示名)" style={input} />
          <input value={wDesc} onChange={(e) => setWDesc(e.target.value)} placeholder="description（任意）" style={{ ...input, gridColumn: "1 / -1" }} />

          <label style={{ fontSize: 12, color: "#666" }}>
            min_age
            <input type="number" value={wMinAge} onChange={(e) => setWMinAge(Number(e.target.value))} style={{ ...input, width: "100%", marginTop: 6 }} />
          </label>

          <label style={{ fontSize: 12, color: "#666", display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={wSensitive} onChange={(e) => setWSensitive(e.target.checked)} />
            is_sensitive（18+相当）
          </label>

          <button onClick={addWorld} disabled={!authed || busy} style={{ ...btn, gridColumn: "1 / -1", opacity: !authed || busy ? 0.6 : 1 }}>
            世界観を追加
          </button>
        </div>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 12 }}>
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
                  <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                    {w.world_key}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={w.title}
                      onChange={(e) => setWorlds((prev) => prev.map((x) => (x.world_key === w.world_key ? { ...x, title: e.target.value } : x)))}
                      style={{ ...input, padding: "6px 8px", width: 200 }}
                    />
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={w.description ?? ""}
                      onChange={(e) => setWorlds((prev) => prev.map((x) => (x.world_key === w.world_key ? { ...x, description: e.target.value } : x)))}
                      style={{ ...input, padding: "6px 8px", width: 360 }}
                    />
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(w.is_sensitive)}
                      onChange={(e) => setWorlds((prev) => prev.map((x) => (x.world_key === w.world_key ? { ...x, is_sensitive: e.target.checked } : x)))}
                    />
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="number"
                      value={Number(w.min_age ?? 0)}
                      onChange={(e) => setWorlds((prev) => prev.map((x) => (x.world_key === w.world_key ? { ...x, min_age: Number(e.target.value) } : x)))}
                      style={{ ...input, padding: "6px 8px", width: 90 }}
                    />
                  </td>
                  <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => saveWorld(w)} disabled={!authed || busy} style={{ ...btn, padding: "8px 10px", opacity: !authed || busy ? 0.6 : 1 }}>
                      保存
                    </button>
                    <button onClick={() => deleteWorld(w.world_key)} disabled={!authed || busy} style={{ ...btnDanger, padding: "8px 10px", opacity: !authed || busy ? 0.6 : 1 }}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {worlds.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 10, color: "#666" }}>世界観がありません</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Topics */}
      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>新しいテーマを追加</h2>
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>topic_key は英数字と _ 推奨（例: movie_anime）</div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="topic_key" style={input} />
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="タイトル" style={input} />
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="説明（任意）" style={{ ...input, gridColumn: "1 / -1" }} />

          <label style={{ fontSize: 12, color: "#666" }}>
            月額（ティア）
            <select value={newPrice} onChange={(e) => setNewPrice(Number(e.target.value))} style={{ ...input, width: "100%", marginTop: 6 }}>
              {PRICES.map((p) => (
                <option key={p} value={p}>{p}（{tierName(p)}）</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            min_age
            <input type="number" value={newMinAge} onChange={(e) => setNewMinAge(Number(e.target.value))} style={{ ...input, width: "100%", marginTop: 6 }} />
          </label>

          <label style={{ fontSize: 12, color: "#666", display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={newSensitive} onChange={(e) => setNewSensitive(e.target.checked)} />
            sensitive（18+相当）
          </label>

          <label style={{ fontSize: 12, color: "#666" }}>
            世界観（割当）
            <select value={newWorldKey} onChange={(e) => setNewWorldKey(e.target.value)} style={{ ...input, width: "100%", marginTop: 6 }}>
              <option value="">（未設定 / null）</option>
              {worlds.map((w) => (
                <option key={w.world_key} value={w.world_key}>
                  {w.title} ({w.world_key})
                </option>
              ))}
            </select>
          </label>

          <button onClick={addTopic} disabled={!authed || busy} style={{ ...btn, gridColumn: "1 / -1", opacity: !authed || busy ? 0.6 : 1 }}>
            追加
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>表示中のテーマ</h2>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>topic_key</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>タイトル</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>世界観（割当）</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>月額</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>18+</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>min_age</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>説明</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleTopics.map((t) => (
                <tr key={t.topic_key} style={{ borderBottom: "1px solid #f3f3f3" }}>
                  <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                    {t.topic_key}
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={t.title}
                      onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, title: e.target.value } : x)))}
                      style={{ ...input, padding: "6px 8px", width: 200 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={t.default_world_key ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, default_world_key: v } : x)));
                      }}
                      style={{ ...input, padding: "6px 8px", width: 230 }}
                    >
                      <option value="">（未設定 / null）</option>
                      {worlds.map((w) => (
                        <option key={w.world_key} value={w.world_key}>
                          {w.title} ({w.world_key})
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>現在: {worldLabel(t.default_world_key)}</div>
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={Number(t.monthly_price ?? 0)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, monthly_price: v } : x)));
                      }}
                      style={{ ...input, padding: "6px 8px" }}
                    >
                      {PRICES.map((p) => (
                        <option key={p} value={p}>{p}（{tierName(p)}）</option>
                      ))}
                    </select>
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(t.is_sensitive)}
                      onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, is_sensitive: e.target.checked } : x)))}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="number"
                      value={Number(t.min_age ?? 0)}
                      onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, min_age: Number(e.target.value) } : x)))}
                      style={{ ...input, padding: "6px 8px", width: 90 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={t.description ?? ""}
                      onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, description: e.target.value } : x)))}
                      style={{ ...input, padding: "6px 8px", width: 320 }}
                    />
                  </td>

                  <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => saveTopic(t)} disabled={!authed || busy} style={{ ...btn, padding: "8px 10px", opacity: !authed || busy ? 0.6 : 1 }}>
                      保存
                    </button>
                    <button onClick={() => archiveTopic(t.topic_key)} disabled={!authed || busy} style={{ ...btnGhost, padding: "8px 10px", opacity: !authed || busy ? 0.6 : 1 }}>
                      非表示にする
                    </button>
                  </td>
                </tr>
              ))}

              {visibleTopics.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 10, color: "#666" }}>表示中のテーマがありません</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12, borderColor: "#f2b7c0" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#b00020" }}>非表示のテーマ（復活 / 完全削除）</h2>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f3d6db" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>topic_key</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>タイトル</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>世界観（割当）</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>月額</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {archivedTopics.map((t) => (
                <tr key={t.topic_key} style={{ borderBottom: "1px solid #f8e6ea" }}>
                  <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                    {t.topic_key}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={t.title}
                      onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, title: e.target.value } : x)))}
                      style={{ ...input, padding: "6px 8px", width: 220 }}
                    />
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={t.default_world_key ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, default_world_key: v } : x)));
                      }}
                      style={{ ...input, padding: "6px 8px", width: 230 }}
                    >
                      <option value="">（未設定 / null）</option>
                      {worlds.map((w) => (
                        <option key={w.world_key} value={w.world_key}>
                          {w.title} ({w.world_key})
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>現在: {worldLabel(t.default_world_key)}</div>
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={Number(t.monthly_price ?? 0)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, monthly_price: v } : x)));
                      }}
                      style={{ ...input, padding: "6px 8px" }}
                    >
                      {PRICES.map((p) => (
                        <option key={p} value={p}>{p}（{tierName(p)}）</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => saveTopic(t)} disabled={!authed || busy} style={{ ...btn, padding: "8px 10px", opacity: !authed || busy ? 0.6 : 1 }}>
                      保存
                    </button>
                    <button onClick={() => unarchiveTopic(t.topic_key)} disabled={!authed || busy} style={{ ...btnGhost, padding: "8px 10px", opacity: !authed || busy ? 0.6 : 1 }}>
                      復活
                    </button>
                    <button onClick={() => hardDeleteTopic(t.topic_key)} disabled={!authed || busy} style={{ ...btnDanger, padding: "8px 10px", opacity: !authed || busy ? 0.6 : 1 }}>
                      完全削除
                    </button>
                  </td>
                </tr>
              ))}

              {archivedTopics.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 10, color: "#666" }}>非表示のテーマがありません</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ height: 24 }} />
    </main>
  );
}
