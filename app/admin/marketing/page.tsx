"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  MARKETING_POST_TYPE_LABELS,
  MARKETING_STATUS_LABELS,
  type MarketingPostRow,
  type MarketingPostStatus,
} from "@/lib/marketing/types";

type StatusFilter = "all" | MarketingPostStatus;

export default function AdminMarketingPage() {
  const [posts, setPosts] = useState<MarketingPostRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openaiConfigured, setOpenaiConfigured] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleLocal, setScheduleLocal] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/marketing/posts?limit=200", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        setMsg("未ログインまたは認証切れです。再ログインしてください。");
        return;
      }
      if (!res.ok || !json?.ok) {
        setMsg(
          String(json?.detail || json?.error || "読み込みに失敗しました") +
            (json?.migrationHint ? ` / ${json.migrationHint}` : "")
        );
        setPosts([]);
        return;
      }
      setPosts((json.posts ?? []) as MarketingPostRow[]);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/admin/marketing/generate", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) {
      setOpenaiConfigured(Boolean(json.openaiConfigured));
    }
  }, []);

  useEffect(() => {
    void load();
    void loadMeta();
  }, [load, loadMeta]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: posts.length };
    for (const p of posts) {
      base[p.status] = (base[p.status] ?? 0) + 1;
    }
    return base;
  }, [posts]);

  const visiblePosts = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.status === filter)),
    [filter, posts]
  );

  async function generate() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/marketing/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowTemplateFallback: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(String(json?.detail || json?.error || "生成に失敗しました"));
        return;
      }
      setMsg(
        json.usedFallback
          ? "テンプレート下書きを3件作成しました（OPENAI_API_KEY 未設定またはAPI失敗時のフォールバック）"
          : "AI投稿案を3件生成しました（すべて draft・未公開）"
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function patchPost(
    id: string,
    body: Record<string, unknown>,
    okMessage: string
  ) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/marketing/posts", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(String(json?.detail || json?.error || "更新に失敗しました"));
        return;
      }
      setMsg(okMessage);
      setEditingId(null);
      setScheduleId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removePost(id: string) {
    if (!window.confirm("この投稿案を削除しますか？")) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(
        `/api/admin/marketing/posts?id=${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(String(json?.detail || json?.error || "削除に失敗しました"));
        return;
      }
      setMsg("削除しました");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("投稿文をコピーしました（手動でXに貼り付けてください）");
    } catch {
      setMsg("コピーに失敗しました。本文を選択してコピーしてください。");
    }
  }

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

  return (
    <main style={adminPageMain}>
      <div style={adminPageInner}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <Link href="/admin" style={{ fontSize: 13, color: "#64748b" }}>
              ← 管理トップ
            </Link>
            <h1 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 900 }}>
              AIマーケティング
            </h1>
            <p style={{ margin: "6px 0 0", color: "#667085", fontSize: 13 }}>
              Phase 1: 投稿案の生成・編集・承認。自動公開はしません。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={adminBtnGhost}
              disabled={busy}
              onClick={() => void load()}
            >
              再読み込み
            </button>
            <button
              type="button"
              style={adminBtn}
              disabled={busy}
              onClick={() => void generate()}
            >
              投稿案を生成（3件）
            </button>
          </div>
        </header>

        <section style={{ ...adminCard, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
            <div>
              OpenAI:{" "}
              {openaiConfigured == null
                ? "確認中…"
                : openaiConfigured
                  ? "設定済み"
                  : "未設定（テンプレート下書きで動作）"}
            </div>
            <div>
              毎朝9:00 JST の自動生成は{" "}
              <code>MARKETING_CRON_ENABLED=1</code>{" "}
              の許可後のみ有効。現状は手動生成を推奨。
            </div>
          </div>
          {msg ? (
            <p style={{ margin: "10px 0 0", color: "#0f766e", fontSize: 13 }}>
              {msg}
            </p>
          ) : null}
        </section>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {(
            [
              "all",
              "draft",
              "approved",
              "scheduled",
              "published",
              "rejected",
              "failed",
            ] as StatusFilter[]
          ).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              style={{
                ...adminBtnGhost,
                padding: "6px 10px",
                fontSize: 12,
                background: filter === key ? "#111827" : "#fff",
                color: filter === key ? "#fff" : "#111827",
              }}
            >
              {key === "all" ? "すべて" : MARKETING_STATUS_LABELS[key]}
              {typeof counts[key] === "number" ? ` (${counts[key]})` : ""}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {visiblePosts.length === 0 ? (
            <div style={{ ...adminCard, color: "#64748b", fontSize: 13 }}>
              {busy
                ? "読み込み中…"
                : posts.length === 0
                  ? "投稿案はまだありません。「投稿案を生成」から始めてください。"
                  : "このステータスの投稿はありません。"}
            </div>
          ) : (
            visiblePosts.map((p) => (
              <article key={p.id} style={adminCard}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {MARKETING_POST_TYPE_LABELS[p.post_type]} · {p.channel} ·{" "}
                    {MARKETING_STATUS_LABELS[p.status]}
                    {p.generation_source === "template_fallback"
                      ? " · template"
                      : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    生成 {fmt(p.created_at)}
                    {p.scheduled_at ? ` · 予約 ${fmt(p.scheduled_at)}` : ""}
                  </div>
                </div>

                {editingId === p.id ? (
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={4}
                    style={adminTextarea}
                    maxLength={200}
                  />
                ) : (
                  <p
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      fontSize: 15,
                      lineHeight: 1.55,
                      fontWeight: 700,
                    }}
                  >
                    {p.body_text}
                  </p>
                )}

                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "#475569",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div>目的: {p.purpose || "—"}</div>
                  <div>対象: {p.target_audience || "—"}</div>
                  <div>CTA: {p.cta || "—"}</div>
                  <div>
                    UTM:{" "}
                    {p.tracking_url ? (
                      <a href={p.tracking_url} style={{ color: "#0369a1" }}>
                        {p.tracking_url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                  {p.publish_error ? (
                    <div style={{ color: "#b91c1c" }}>
                      エラー: {p.publish_error}
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    style={adminBtnGhost}
                    onClick={() => void copyText(p.body_text)}
                  >
                    本文コピー
                  </button>
                  {p.tracking_url ? (
                    <button
                      type="button"
                      style={adminBtnGhost}
                      onClick={() => void copyText(p.tracking_url || "")}
                    >
                      UTMコピー
                    </button>
                  ) : null}

                  {editingId === p.id ? (
                    <>
                      <button
                        type="button"
                        style={adminBtn}
                        disabled={busy}
                        onClick={() =>
                          void patchPost(
                            p.id,
                            { body_text: editBody },
                            "本文を保存しました"
                          )
                        }
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        style={adminBtnGhost}
                        onClick={() => setEditingId(null)}
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      style={adminBtnGhost}
                      onClick={() => {
                        setEditingId(p.id);
                        setEditBody(p.body_text);
                      }}
                    >
                      編集
                    </button>
                  )}

                  {p.status === "draft" || p.status === "rejected" ? (
                    <button
                      type="button"
                      style={adminBtn}
                      disabled={busy}
                      onClick={() =>
                        void patchPost(
                          p.id,
                          { status: "approved" },
                          "承認しました（まだ自動投稿しません）"
                        )
                      }
                    >
                      承認
                    </button>
                  ) : null}

                  {p.status !== "rejected" && p.status !== "published" ? (
                    <button
                      type="button"
                      style={adminBtnGhost}
                      disabled={busy}
                      onClick={() =>
                        void patchPost(
                          p.id,
                          {
                            status: "rejected",
                            rejection_reason: "admin_rejected",
                          },
                          "却下しました"
                        )
                      }
                    >
                      却下
                    </button>
                  ) : null}

                  {p.status === "approved" || p.status === "scheduled" ? (
                    scheduleId === p.id ? (
                      <>
                        <input
                          type="datetime-local"
                          value={scheduleLocal}
                          onChange={(e) => setScheduleLocal(e.target.value)}
                          style={adminInput}
                        />
                        <button
                          type="button"
                          style={adminBtn}
                          disabled={busy || !scheduleLocal}
                          onClick={() => {
                            const iso = new Date(scheduleLocal).toISOString();
                            void patchPost(
                              p.id,
                              { status: "scheduled", scheduled_at: iso },
                              "予約を保存しました（外部投稿は未接続）"
                            );
                          }}
                        >
                          予約確定
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        style={adminBtnGhost}
                        onClick={() => {
                          setScheduleId(p.id);
                          setScheduleLocal("");
                        }}
                      >
                        予約日時
                      </button>
                    )
                  ) : null}

                  {p.status === "approved" || p.status === "scheduled" ? (
                    <button
                      type="button"
                      style={adminBtnGhost}
                      disabled={busy}
                      onClick={() =>
                        void patchPost(
                          p.id,
                          { status: "published" },
                          "手動公開済みとして記録しました"
                        )
                      }
                    >
                      手動公開済にする
                    </button>
                  ) : null}

                  <button
                    type="button"
                    style={{ ...adminBtnGhost, color: "#b91c1c" }}
                    disabled={busy}
                    onClick={() => void removePost(p.id)}
                  >
                    削除
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
