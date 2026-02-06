"use client";

import { useEffect, useMemo, useState } from "react";

type TopicRow = {
  topic_key: string;
  title?: string | null;
  description?: string | null;
  monthly_price?: number | null;
  is_sensitive?: boolean | null;
  min_age?: number | null;
};

type ClassRow = {
  id: string;
  name: string;
  description: string;
  topic_key: string | null;
  world_key: string | null;
};

type WorldRow = {
  world_key: string;
  title: string;
  description?: string | null;
  is_sensitive?: boolean | null;
  min_age?: number | null;
};

const PRICES = [0, 400, 800, 1200] as const;

export default function AdminTopicEditor({ onPatched }: { onPatched?: () => void }) {
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState("");
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [worlds, setWorlds] = useState<WorldRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [msg, setMsg] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);

  // add form
  const [newKey, setNewKey] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState<number>(0);
  const [newSensitive, setNewSensitive] = useState(false);
  const [newMinAge, setNewMinAge] = useState(18);

  const [createBoard, setCreateBoard] = useState(true);
  const [boardName, setBoardName] = useState("");
  const [boardDesc, setBoardDesc] = useState("");
  const [boardWorldKey, setBoardWorldKey] = useState<string>(""); // "" = null扱い

  // class editor panel
  const [classTopicKey, setClassTopicKey] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classLoading, setClassLoading] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_passcode");
    if (saved) setPass(saved);
  }, []);

  const authed = useMemo(() => pass.trim().length > 0, [pass]);

  const panelStyle: React.CSSProperties = {
    marginTop: 16,
    border: "1px solid #333",
    borderRadius: 18,
    padding: 14,
    background: "#0f0f10",
    color: "#fff",
  };

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #333",
    background: "#141416",
    color: "#fff",
    outline: "none",
  };

  const btnStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    fontWeight: 900,
    border: "1px solid #333",
    background: "#1b1b1e",
    color: "#fff",
    cursor: "pointer",
  };

  async function loadAll() {
    setLoading(true);
    setMsg("");
    try {
      // topics
      const tr = await fetch("/api/admin/topics", {
        headers: { "x-admin-passcode": pass.trim() },
        cache: "no-store",
      });
      const tj = await tr.json();
      if (!tr.ok) throw new Error(tj?.error || "topics_failed");
      setTopics(tj.topics || []);

      // worlds
      const wr = await fetch("/api/admin/worlds", {
        headers: { "x-admin-passcode": pass.trim() },
        cache: "no-store",
      });
      const wj = await wr.json();
      if (!wr.ok) throw new Error(wj?.error || "worlds_failed");
      setWorlds(wj.worlds || []);

      setMsg(`loaded (topics: ${tj.count ?? "?"}, worlds: ${wj.worlds?.length ?? "?"})`);
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    } finally {
      setLoading(false);
    }
  }

  function enableAndLoad() {
    sessionStorage.setItem("admin_passcode", pass.trim());
    loadAll();
  }

  async function addTopic() {
    setMsg("");
    setLastResult(null);
    try {
      const key = newKey.trim();
      const title = newTitle.trim();

      const res = await fetch("/api/admin/topics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-passcode": pass.trim(),
        },
        body: JSON.stringify({
          topic_key: key,
          title,
          description: newDesc,
          monthly_price: Number(newPrice),
          is_sensitive: Boolean(newSensitive),
          min_age: Number(newMinAge),

          create_default_class: Boolean(createBoard),
          default_class_name: boardName.trim() || `【新】${title}`,
          default_class_description: boardDesc.trim() || `テーマ「${title}」のボード`,
          default_world_key: boardWorldKey ? boardWorldKey : null,
        }),
      });

      const json = await res.json();
      setLastResult(json);

      if (!res.ok) throw new Error(json?.error || "failed");

      const ins = json?.inserted_topic;
      const w = json?.class_warning ? ` / class_warning: ${json.class_warning}` : "";
      setMsg(`added: ${ins?.topic_key ?? "?"}${w}`);

      setNewKey("");
      setNewTitle("");
      setNewDesc("");
      setNewPrice(0);
      setNewSensitive(false);
      setNewMinAge(18);
      setBoardName("");
      setBoardDesc("");
      setBoardWorldKey("");

      onPatched?.();
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    }
  }

  async function saveTopic(t: TopicRow) {
    setMsg("");
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/topics", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-passcode": pass.trim() },
        body: JSON.stringify({
          topic_key: t.topic_key,
          title: t.title ?? "",
          description: t.description ?? "",
          monthly_price: Number(t.monthly_price ?? 0),
          is_sensitive: Boolean(t.is_sensitive),
          min_age: Number(t.min_age ?? 18),
        }),
      });
      const json = await res.json();
      setLastResult(json);
      if (!res.ok) throw new Error(json?.error || "failed");
      setMsg(`saved: ${t.topic_key}`);
      onPatched?.();
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    }
  }

  async function deleteTopic(topic_key: string) {
    if (!confirm(`テーマ「${topic_key}」を削除します。\n（紐づくボードも消します）\nよろしいですか？`)) return;
    setMsg("");
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/topics", {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-admin-passcode": pass.trim() },
        body: JSON.stringify({ topic_key }),
      });
      const json = await res.json();
      setLastResult(json);
      if (!res.ok) throw new Error(json?.error || "failed");
      setMsg(`deleted: ${topic_key}`);
      onPatched?.();
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    }
  }

  async function openClasses(topic_key: string) {
    setClassTopicKey(topic_key);
    setClassLoading(true);
    try {
      const res = await fetch("/api/admin/classes", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": pass.trim() },
        body: JSON.stringify({ topic_key }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "failed");
      setClasses(json.classes ?? []);
    } catch (e: any) {
      alert(e?.message ?? "failed");
    } finally {
      setClassLoading(false);
    }
  }

  async function saveClass(c: ClassRow) {
    try {
      const res = await fetch("/api/admin/classes", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-passcode": pass.trim() },
        body: JSON.stringify({
          id: c.id,
          name: c.name,
          description: c.description,
          world_key: c.world_key,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "failed");
      setMsg(`class saved: ${c.id}`);
      onPatched?.();
      if (classTopicKey) await openClasses(classTopicKey);
    } catch (e: any) {
      alert(e?.message ?? "failed");
    }
  }

  const worldLabel = (key: string | null) => {
    if (!key) return "（未設定）";
    const w = worlds.find((x) => x.world_key === key);
    return w ? `${w.title} (${w.world_key})` : key;
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <strong style={{ fontSize: 14, color: "#fff" }}>管理モード（テーマ/世界観/ボード編集）</strong>
        <button onClick={() => setOpen((v) => !v)} style={btnStyle}>
          {open ? "閉じる" : "開く"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="ADMIN_PASSCODE" style={{ ...inputStyle, width: 260 }} />
            <button onClick={enableAndLoad} disabled={!authed || loading} style={{ ...btnStyle, opacity: !authed || loading ? 0.6 : 1 }}>
              {loading ? "読み込み中…" : "有効化して読み込む"}
            </button>
            {msg ? <span style={{ fontSize: 12, color: "#ddd" }}>{msg}</span> : null}
          </div>

          {/* 追加フォーム */}
          <div style={{ border: "1px solid #2a2a2c", borderRadius: 16, padding: 12, background: "#121214" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>テーマ追加（初期ボードに世界観を設定可）</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="topic_key (例: sports)" style={inputStyle} />
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="title (表示名)" style={inputStyle} />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="description（任意）" style={{ ...inputStyle, gridColumn: "1 / -1" }} />

              <label style={{ fontSize: 12, color: "#ddd" }}>
                テーマプラン必要額（0/400/800/1200）
                <select value={newPrice} onChange={(e) => setNewPrice(Number(e.target.value))} style={{ ...inputStyle, width: "100%", marginTop: 6 }}>
                  {PRICES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 12, color: "#ddd" }}>
                min_age
                <input type="number" value={newMinAge} onChange={(e) => setNewMinAge(Number(e.target.value))} style={{ ...inputStyle, width: "100%", marginTop: 6 }} />
              </label>

              <label style={{ fontSize: 12, color: "#ddd", display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={newSensitive} onChange={(e) => setNewSensitive(e.target.checked)} />
                18+（is_sensitive）
              </label>

              <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #2a2a2c", paddingTop: 10 }}>
                <label style={{ fontSize: 12, color: "#ddd", display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={createBoard} onChange={(e) => setCreateBoard(e.target.checked)} />
                  同時にボード（classes）も作る
                </label>

                {createBoard && (
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input value={boardName} onChange={(e) => setBoardName(e.target.value)} placeholder="ボード名（空なら自動）" style={inputStyle} />
                    <input value={boardDesc} onChange={(e) => setBoardDesc(e.target.value)} placeholder="ボード説明（空なら自動）" style={inputStyle} />

                    <label style={{ fontSize: 12, color: "#ddd", gridColumn: "1 / -1" }}>
                      世界観（world）
                      <select value={boardWorldKey} onChange={(e) => setBoardWorldKey(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 6 }}>
                        <option value="">（未設定 / null）</option>
                        {worlds.map((w) => (
                          <option key={w.world_key} value={w.world_key}>
                            {w.title} ({w.world_key})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <button onClick={addTopic} disabled={!authed || loading} style={{ ...btnStyle, width: "100%", opacity: !authed || loading ? 0.6 : 1 }}>
                  追加する
                </button>
              </div>
            </div>

            {lastResult ? (
              <pre style={{ marginTop: 10, padding: 10, border: "1px solid #2a2a2c", borderRadius: 12, background: "#0f0f10", color: "#ddd", fontSize: 11, overflowX: "auto" }}>
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            ) : null}
          </div>

          {/* topics 一覧（編集可能） */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse", fontSize: 12, color: "#fff" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2a2a2c" }}>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>topic_key</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>title</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>description</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>必要プラン</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>18+</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>min_age</th>
                  <th style={{ textAlign: "left", padding: "8px 6px" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.topic_key} style={{ borderBottom: "1px solid #1f1f22" }}>
                    <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                      {t.topic_key}
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <input
                        value={String(t.title ?? "")}
                        onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, title: e.target.value } : x)))}
                        style={{ ...inputStyle, padding: "6px 8px", width: 180 }}
                      />
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <input
                        value={String(t.description ?? "")}
                        onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, description: e.target.value } : x)))}
                        style={{ ...inputStyle, padding: "6px 8px", width: 360 }}
                      />
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <select
                        value={Number(t.monthly_price ?? 0)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, monthly_price: v } : x)));
                        }}
                        style={{ ...inputStyle, padding: "6px 8px" }}
                      >
                        {PRICES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(t.is_sensitive)}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, is_sensitive: v } : x)));
                        }}
                      />
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <input
                        type="number"
                        value={Number(t.min_age ?? 18)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, min_age: v } : x)));
                        }}
                        style={{ ...inputStyle, width: 90, padding: "6px 8px" }}
                      />
                    </td>
                    <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => saveTopic(t)} style={{ ...btnStyle, padding: "8px 10px" }}>
                        保存
                      </button>
                      <button onClick={() => openClasses(t.topic_key)} style={{ ...btnStyle, padding: "8px 10px" }}>
                        ボード編集
                      </button>
                      <button
                        onClick={() => deleteTopic(t.topic_key)}
                        style={{ ...btnStyle, padding: "8px 10px", background: "#2a1111", borderColor: "#5a2222" }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}

                {topics.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 10, color: "#ddd" }}>データなし（または認証失敗）</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* ボード編集パネル */}
          {classTopicKey && (
            <div style={{ border: "1px solid #2a2a2c", borderRadius: 16, padding: 12, background: "#121214" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <strong>ボード編集（topic_key: {classTopicKey}）</strong>
                <button onClick={() => { setClassTopicKey(null); setClasses([]); }} style={btnStyle}>
                  閉じる
                </button>
              </div>

              {classLoading ? (
                <div style={{ marginTop: 10, color: "#ddd" }}>読み込み中…</div>
              ) : (
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {classes.map((c) => (
                    <div key={c.id} style={{ border: "1px solid #2a2a2c", borderRadius: 14, padding: 10, background: "#0f0f10" }}>
                      <div style={{ fontSize: 11, color: "#ddd", marginBottom: 6 }}>id: {c.id}</div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={{ fontSize: 12, color: "#ddd" }}>
                          name
                          <input
                            value={c.name}
                            onChange={(e) => setClasses((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                            style={{ ...inputStyle, width: "100%", marginTop: 6 }}
                          />
                        </label>

                        <label style={{ fontSize: 12, color: "#ddd" }}>
                          世界観（world）
                          <select
                            value={c.world_key ?? ""}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              setClasses((prev) => prev.map((x) => (x.id === c.id ? { ...x, world_key: v } : x)));
                            }}
                            style={{ ...inputStyle, width: "100%", marginTop: 6 }}
                          >
                            <option value="">（未設定 / null）</option>
                            {worlds.map((w) => (
                              <option key={w.world_key} value={w.world_key}>
                                {w.title} ({w.world_key})
                              </option>
                            ))}
                          </select>
                          <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
                            現在: {worldLabel(c.world_key)}
                          </div>
                        </label>
                      </div>

                      <label style={{ fontSize: 12, color: "#ddd", display: "block", marginTop: 10 }}>
                        description
                        <input
                          value={c.description ?? ""}
                          onChange={(e) => setClasses((prev) => prev.map((x) => (x.id === c.id ? { ...x, description: e.target.value } : x)))}
                          style={{ ...inputStyle, width: "100%", marginTop: 6 }}
                        />
                      </label>

                      <div style={{ marginTop: 10 }}>
                        <button onClick={() => saveClass(c)} style={btnStyle}>
                          このボードを保存
                        </button>
                      </div>
                    </div>
                  ))}

                  {classes.length === 0 ? (
                    <div style={{ color: "#ddd" }}>このテーマに紐づくボードがありません。</div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
