"use client";

import { useEffect, useMemo, useState } from "react";

type TopicRow = {
  topic_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
  monthly_price: number;
  is_archived?: boolean;
  created_at?: string;
};

const PRICES = [0, 400, 800, 1200] as const;

function tierName(price: number) {
  if (price >= 1200) return "プレミアム";
  if (price >= 800) return "ミドル";
  if (price >= 400) return "ライト";
  return "無料";
}

async function postAdmin(body: any) {
  const r = await fetch("/api/admin/topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? "admin_request_failed");
  if (!j?.ok) throw new Error(j?.error ?? "admin_not_ok");
  return j;
}

export default function AdminTopicEditor({ onPatched }: { onPatched?: () => void }) {
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [msg, setMsg] = useState("");

  // add form
  const [newKey, setNewKey] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState<number>(0);
  const [newSensitive, setNewSensitive] = useState(false);
  const [newMinAge, setNewMinAge] = useState(0);

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_password");
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

  async function loadAll(showArchived: boolean) {
    if (!authed) return;
    setLoading(true);
    setMsg("");
    try {
      const j = await postAdmin({
        password: pass.trim(),
        mode: "list",
        show_archived: Boolean(showArchived),
      });
      setTopics(j.topics ?? []);
      setMsg(`loaded: ${j.topics?.length ?? 0}`);
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    } finally {
      setLoading(false);
    }
  }

  function enableAndLoad() {
    sessionStorage.setItem("admin_password", pass.trim());
    loadAll(true);
  }

  async function addTopic() {
    setMsg("");
    try {
      const key = newKey.trim();
      const title = newTitle.trim();
      if (!key) throw new Error("topic_key required");
      if (!title) throw new Error("title required");

      await postAdmin({
        password: pass.trim(),
        mode: "create",
        topic: {
          topic_key: key,
          title,
          description: newDesc,
          monthly_price: Number(newPrice),
          is_sensitive: Boolean(newSensitive),
          min_age: Number(newMinAge),
        },
      });

      setMsg(`added: ${key}`);
      setNewKey("");
      setNewTitle("");
      setNewDesc("");
      setNewPrice(0);
      setNewSensitive(false);
      setNewMinAge(0);

      onPatched?.();
      await loadAll(true);
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    }
  }

  async function saveTopic(t: TopicRow) {
    setMsg("");
    try {
      await postAdmin({
        password: pass.trim(),
        mode: "update",
        topic_key: t.topic_key,
        patch: {
          title: t.title,
          description: t.description ?? "",
          monthly_price: Number(t.monthly_price ?? 0),
          is_sensitive: Boolean(t.is_sensitive),
          min_age: Number(t.min_age ?? 0),
        },
      });
      setMsg(`saved: ${t.topic_key}`);
      onPatched?.();
      await loadAll(true);
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    }
  }

  async function archiveTopic(topic_key: string) {
    setMsg("");
    try {
      await postAdmin({ password: pass.trim(), mode: "archive", topic_key });
      setMsg(`archived: ${topic_key}`);
      onPatched?.();
      await loadAll(true);
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    }
  }

  async function unarchiveTopic(topic_key: string) {
    setMsg("");
    try {
      await postAdmin({ password: pass.trim(), mode: "unarchive", topic_key });
      setMsg(`unarchived: ${topic_key}`);
      onPatched?.();
      await loadAll(true);
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    }
  }

  async function hardDeleteTopic(topic_key: string) {
    if (!confirm(`テーマ「${topic_key}」を完全削除します。\n（非表示にした後のみ削除できます）\nよろしいですか？`)) return;
    setMsg("");
    try {
      await postAdmin({ password: pass.trim(), mode: "delete", topic_key });
      setMsg(`deleted: ${topic_key}`);
      onPatched?.();
      await loadAll(true);
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    }
  }

  const visibleTopics = topics.filter((t) => !t.is_archived);
  const archivedTopics = topics.filter((t) => t.is_archived);

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <strong style={{ fontSize: 14 }}>管理モード（テーマ管理）</strong>
        <button onClick={() => setOpen((v) => !v)} style={btnStyle}>
          {open ? "閉じる" : "開く"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="ADMIN_PASSWORD"
              style={{ ...inputStyle, width: 260 }}
            />
            <button onClick={enableAndLoad} disabled={!authed || loading} style={{ ...btnStyle, opacity: !authed || loading ? 0.6 : 1 }}>
              {loading ? "読み込み中…" : "有効化して読み込む"}
            </button>
            {msg ? <span style={{ fontSize: 12, color: "#ddd" }}>{msg}</span> : null}
          </div>

          {/* 追加フォーム */}
          <div style={{ border: "1px solid #2a2a2c", borderRadius: 16, padding: 12, background: "#121214" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>テーマ追加</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="topic_key (例: train)" style={inputStyle} />
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="title（表示名）" style={inputStyle} />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="description（任意）" style={{ ...inputStyle, gridColumn: "1 / -1" }} />

              <label style={{ fontSize: 12, color: "#ddd" }}>
                必要プラン（0/400/800/1200）
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

              <div style={{ gridColumn: "1 / -1" }}>
                <button onClick={addTopic} disabled={!authed || loading} style={{ ...btnStyle, width: "100%", opacity: !authed || loading ? 0.6 : 1 }}>
                  追加する
                </button>
              </div>
            </div>
          </div>

          {/* 表示中 */}
          <div style={{ border: "1px solid #2a2a2c", borderRadius: 16, padding: 12, background: "#121214" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>表示中のテーマ</div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2a2a2c" }}>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>key</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>title</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>desc</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>必要</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>18+</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>min</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTopics.map((t) => (
                    <tr key={t.topic_key} style={{ borderBottom: "1px solid #1f1f22" }}>
                      <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {t.topic_key}
                      </td>

                      <td style={{ padding: "8px 6px" }}>
                        <input
                          value={t.title ?? ""}
                          onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, title: e.target.value } : x)))}
                          style={{ ...inputStyle, padding: "6px 8px", width: 180 }}
                        />
                      </td>

                      <td style={{ padding: "8px 6px" }}>
                        <input
                          value={t.description ?? ""}
                          onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, description: e.target.value } : x)))}
                          style={{ ...inputStyle, padding: "6px 8px", width: 360 }}
                        />
                      </td>

                      <td style={{ padding: "8px 6px" }}>
                        <select
                          value={Number(t.monthly_price ?? 0)}
                          onChange={(e) => setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, monthly_price: Number(e.target.value) } : x)))}
                          style={{ ...inputStyle, padding: "6px 8px" }}
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
                          style={{ ...inputStyle, width: 90, padding: "6px 8px" }}
                        />
                      </td>

                      <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => saveTopic(t)} style={{ ...btnStyle, padding: "8px 10px" }}>
                          保存
                        </button>
                        <button onClick={() => archiveTopic(t.topic_key)} style={{ ...btnStyle, padding: "8px 10px", background: "#2a1111", borderColor: "#5a2222" }}>
                          非表示
                        </button>
                      </td>
                    </tr>
                  ))}

                  {visibleTopics.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 10, color: "#ddd" }}>なし</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* 非表示 */}
          <div style={{ border: "1px solid #5a2222", borderRadius: 16, padding: 12, background: "#1a0f10" }}>
            <div style={{ fontWeight: 900, marginBottom: 8, color: "#ffd4d4" }}>非表示のテーマ（復活/完全削除）</div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 12, color: "#ffd4d4" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #5a2222" }}>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>key</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>title</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>必要</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedTopics.map((t) => (
                    <tr key={t.topic_key} style={{ borderBottom: "1px solid #3a1b1b" }}>
                      <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {t.topic_key}
                      </td>
                      <td style={{ padding: "8px 6px" }}>{t.title}</td>
                      <td style={{ padding: "8px 6px" }}>{t.monthly_price}</td>
                      <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => unarchiveTopic(t.topic_key)} style={{ ...btnStyle, padding: "8px 10px" }}>
                          復活
                        </button>
                        <button onClick={() => hardDeleteTopic(t.topic_key)} style={{ ...btnStyle, padding: "8px 10px", background: "#3a0000", borderColor: "#7a2222" }}>
                          完全削除
                        </button>
                      </td>
                    </tr>
                  ))}

                  {archivedTopics.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: 10, color: "#ffd4d4" }}>なし</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#aaa" }}>
            ※ この管理画面は <code>/api/admin/topics</code>（mode式）に合わせています。<br />
            ※ 追加/保存後にユーザー側へ反映させるため <code>onPatched()</code> を呼びます。
          </div>
        </div>
      )}
    </div>
  );
}
