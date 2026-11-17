"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  adminBtn,
  adminBtnGhost,
  adminCard,
  adminInput,
  adminPageInner,
  adminPageMain,
  adminTextarea,
} from "@/app/admin/adminUi";
import {
  CHARTER_CATEGORY_LABELS,
  type CharterCategory,
  type CharterImportance,
  type CharterMemoRow,
  type CharterPolicyRow,
} from "@/lib/marketing/operatingCharter/types";

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const CATEGORIES = Object.keys(CHARTER_CATEGORY_LABELS) as CharterCategory[];

export default function AdminOperatingCharterPage() {
  const [policies, setPolicies] = useState<CharterPolicyRow[]>([]);
  const [memos, setMemos] = useState<CharterMemoRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [memoText, setMemoText] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<CharterCategory>("philosophy");
  const [importance, setImportance] = useState<CharterImportance>("high");
  const [revisions, setRevisions] = useState<
    Array<{ id: string; version: number; action: string; created_at: string }>
  >([]);
  const [revPolicyId, setRevPolicyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const [pRes, mRes] = await Promise.all([
        fetch("/api/admin/marketing/charter?view=policies&status=open", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/admin/marketing/charter?view=memos", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);
      const pJson = await pRes.json().catch(() => null);
      const mJson = await mRes.json().catch(() => null);
      if (pRes.status === 401) {
        setMsg("未ログインまたは認証切れです。再ログインしてください。");
        return;
      }
      if (!pRes.ok || !pJson?.ok) {
        setMsg(
          String(pJson?.detail || pJson?.error || "読込失敗") +
            (pJson?.migrationHint ? ` / ${pJson.migrationHint}` : "")
        );
        setPolicies([]);
      } else {
        setPolicies((pJson.policies ?? []) as CharterPolicyRow[]);
      }
      if (mRes.ok && mJson?.ok) setMemos((mJson.memos ?? []) as CharterMemoRow[]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function postAction(payload: Record<string, unknown>) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/marketing/charter", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(
          String(json?.detail || json?.error || "失敗") +
            (json?.migrationHint ? ` / ${json.migrationHint}` : "")
        );
        return;
      }
      if (payload.action === "memo" && json.classification) {
        const c = json.classification;
        setMsg(
          `メモ分類: ${c.category} / ${c.suggestedStatus}` +
            (c.conflicts?.length ? `（矛盾 ${c.conflicts.length}件 → 承認待ち）` : "")
        );
      } else {
        setMsg("保存しました");
      }
      setMemoText("");
      setTitle("");
      setBody("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function loadRevisions(policyId: string) {
    setRevPolicyId(policyId);
    const res = await fetch(
      `/api/admin/marketing/charter?view=revisions&policyId=${encodeURIComponent(policyId)}`,
      { cache: "no-store", credentials: "same-origin" }
    );
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) setRevisions(json.revisions ?? []);
  }

  return (
    <main style={adminPageMain}>
      <div style={adminPageInner}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/admin/marketing" style={{ fontSize: 14 }}>
            ← AIマーケティング
          </Link>
          <Link href="/admin" style={{ fontSize: 14 }}>
            管理ホーム
          </Link>
        </div>
        <h1 style={{ marginTop: 12, marginBottom: 8 }}>AI運営憲章</h1>
        <p style={{ marginTop: 0, color: "#444", maxWidth: 720 }}>
          サービス理念・禁止事項・SNS/UI方針などを保存し、投稿生成・週次分析・改善提案が参照します。
          自由入力メモは信頼できない入力として扱い、重要方針との矛盾は自動上書きせず承認を求めます。
          本番DB適用は別途承認が必要です。
        </p>
        {msg ? (
          <div style={{ ...adminCard, marginBottom: 12, whiteSpace: "pre-wrap" }}>{msg}</div>
        ) : null}

        <section style={{ ...adminCard, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>自由入力メモ</h2>
          <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
            自然文で方針やアイデアを追加。AIが分類し、アイデアは「未採用」、矛盾は承認待ちになります。
            秘密情報（APIキー等）は保存できません。
          </p>
          <textarea
            style={{ ...adminTextarea, minHeight: 100, width: "100%" }}
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            placeholder="例: SNSでは出会い目的の表現を禁止。ホーム画像は少人数の穏やかな通話雰囲気を優先したい。"
          />
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              style={adminBtn}
              disabled={busy || memoText.trim().length < 4}
              onClick={() => void postAction({ action: "memo", text: memoText })}
            >
              メモを分類して保存
            </button>
          </div>
        </section>

        <section style={{ ...adminCard, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>方針を手動追加</h2>
          <div style={{ display: "grid", gap: 8, maxWidth: 640 }}>
            <label>
              カテゴリ{" "}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CharterCategory)}
                style={adminInput}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CHARTER_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              重要度{" "}
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value as CharterImportance)}
                style={adminInput}
              >
                {(["critical", "high", "medium", "low"] as CharterImportance[]).map(
                  (i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  )
                )}
              </select>
            </label>
            <input
              style={adminInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル"
            />
            <textarea
              style={{ ...adminTextarea, minHeight: 80 }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="本文"
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={adminBtn}
                disabled={busy || !title.trim() || !body.trim()}
                onClick={() =>
                  void postAction({
                    action: "create",
                    category,
                    importance,
                    title,
                    body,
                    status: category === "idea" ? "idea_unadopted" : "active",
                  })
                }
              >
                {category === "idea" ? "アイデアとして保存" : "有効方針として保存"}
              </button>
            </div>
          </div>
        </section>

        <section style={{ ...adminCard, marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16 }}>有効・未採用・承認待ち</h2>
            <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void load()}>
              再読込
            </button>
          </div>
          {policies.length === 0 ? (
            <p style={{ color: "#666" }}>まだ方針がありません。</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
              {policies.map((p) => (
                <li
                  key={p.id}
                  style={{
                    borderTop: "1px solid #e5e5e5",
                    padding: "12px 0",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    [{CHARTER_CATEGORY_LABELS[p.category] ?? p.category}] {p.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>{p.body}</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                    状態:{p.status} / 重要度:{p.importance} / 優先Tier:{p.priority_tier} /
                    v{p.version} / 更新:{fmt(p.updated_at)}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {p.status !== "active" ? (
                      <button
                        type="button"
                        style={adminBtn}
                        disabled={busy}
                        onClick={() =>
                          void postAction({
                            action: "set_status",
                            id: p.id,
                            status: "active",
                          })
                        }
                      >
                        有効化
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={adminBtnGhost}
                        disabled={busy}
                        onClick={() =>
                          void postAction({
                            action: "set_status",
                            id: p.id,
                            status: "inactive",
                          })
                        }
                      >
                        無効化
                      </button>
                    )}
                    <button
                      type="button"
                      style={adminBtnGhost}
                      disabled={busy}
                      onClick={() => void loadRevisions(p.id)}
                    >
                      履歴
                    </button>
                  </div>
                  {revPolicyId === p.id && revisions.length > 0 ? (
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                      {revisions.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <span>
                            v{r.version} {r.action} {fmt(r.created_at)}
                          </span>
                          <button
                            type="button"
                            style={adminBtnGhost}
                            disabled={busy}
                            onClick={() =>
                              void postAction({
                                action: "restore",
                                policyId: p.id,
                                version: r.version,
                              })
                            }
                          >
                            この版へ復元
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={{ ...adminCard, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>最近のメモ</h2>
          {memos.length === 0 ? (
            <p style={{ color: "#666" }}>メモはまだありません。</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {memos.map((m) => (
                <li
                  key={m.id}
                  style={{ borderTop: "1px solid #eee", padding: "10px 0" }}
                >
                  <div style={{ fontSize: 13 }}>{m.sanitized_text}</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    {m.status} / {m.ai_category ?? "—"} / {fmt(m.created_at)}
                    {m.analysis_notes ? ` / ${m.analysis_notes}` : ""}
                  </div>
                  {m.status === "needs_approval" ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button
                        type="button"
                        style={adminBtn}
                        disabled={busy}
                        onClick={() =>
                          void postAction({
                            action: "approve_memo",
                            memoId: m.id,
                            activate: true,
                          })
                        }
                      >
                        承認して有効化
                      </button>
                      <button
                        type="button"
                        style={adminBtnGhost}
                        disabled={busy}
                        onClick={() =>
                          void postAction({
                            action: "approve_memo",
                            memoId: m.id,
                            activate: false,
                          })
                        }
                      >
                        アイデアとして保存
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
