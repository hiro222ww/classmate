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
import type { MarketingDashboardMetrics } from "@/lib/marketing/metrics";
import {
  MARKETING_POST_TYPE_LABELS,
  MARKETING_STATUS_LABELS,
  type MarketingPostRow,
  type MarketingPostStatus,
} from "@/lib/marketing/types";

type StatusFilter = "all" | MarketingPostStatus;

type BufferStatus = {
  credentialsPresent: boolean;
  publishEnabled: boolean;
  connected: boolean;
  note: string;
};

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

function pct(rate: number | null) {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export default function AdminMarketingPage() {
  const [posts, setPosts] = useState<MarketingPostRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openaiConfigured, setOpenaiConfigured] = useState<boolean | null>(null);
  const [cronEnabled, setCronEnabled] = useState(false);
  const [buffer, setBuffer] = useState<BufferStatus | null>(null);
  const [activeAdapter, setActiveAdapter] = useState<"buffer" | "manual">(
    "manual"
  );
  const [metrics, setMetrics] = useState<MarketingDashboardMetrics | null>(null);
  const [metricsMsg, setMetricsMsg] = useState("");
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
      setCronEnabled(Boolean(json.cronEnabled));
      if (json.buffer) setBuffer(json.buffer as BufferStatus);
      if (json.activeAdapter === "buffer" || json.activeAdapter === "manual") {
        setActiveAdapter(json.activeAdapter);
      }
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setMetricsMsg("");
    const res = await fetch("/api/admin/marketing/metrics?days=14", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setMetrics(null);
      setMetricsMsg(
        String(json?.detail || json?.error || "集計の読み込みに失敗") +
          (json?.migrationHint ? ` / ${json.migrationHint}` : "")
      );
      return;
    }
    setMetrics(json.metrics as MarketingDashboardMetrics);
  }, []);

  useEffect(() => {
    void load();
    void loadMeta();
    void loadMetrics();
  }, [load, loadMeta, loadMetrics]);

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

  async function publishToBuffer(id: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/marketing/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(
          String(json?.detail || json?.error || "Buffer送信に失敗しました") +
            (json?.retryable ? "（再試行できます）" : "")
        );
        await load();
        return;
      }
      setMsg(
        json.scheduledOnly
          ? "Bufferへ予約登録しました（まだSNS上は未公開）"
          : "Buffer経由で公開済みとして記録しました"
      );
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
      setMsg("コピーしました");
    } catch {
      setMsg("コピーに失敗しました。本文を選択してコピーしてください。");
    }
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
              Phase 2/3: Buffer予約連携・UTM集計。無承認の自動公開はしません。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={adminBtnGhost}
              disabled={busy}
              onClick={() => {
                void load();
                void loadMeta();
                void loadMetrics();
              }}
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
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
            <div>
              OpenAI:{" "}
              {openaiConfigured == null
                ? "確認中…"
                : openaiConfigured
                  ? "設定済み"
                  : "未設定（テンプレート下書き）"}
            </div>
            <div>
              Buffer: {buffer?.note ?? "確認中…"}
              {activeAdapter ? ` / adapter=${activeAdapter}` : ""}
            </div>
            <div>
              Cron: {cronEnabled ? "有効" : "無効（MARKETING_CRON_ENABLED≠1）"}
            </div>
          </div>
          {msg ? (
            <p style={{ margin: "10px 0 0", color: "#0f766e", fontSize: 13 }}>
              {msg}
            </p>
          ) : null}
        </section>

        <section style={{ ...adminCard, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 900 }}>
            集客ダッシュボード（直近14日・JST）
          </h2>
          {metricsMsg ? (
            <p style={{ color: "#b91c1c", fontSize: 13 }}>{metricsMsg}</p>
          ) : null}
          {!metrics ? (
            <p style={{ color: "#64748b", fontSize: 13 }}>集計読み込み中…</p>
          ) : (
            <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
              {metrics.notes.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18, color: "#64748b" }}>
                  {metrics.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}

              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  SNS別の訪問者数
                </div>
                {metrics.visitsBySource.length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>データなし</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#64748b" }}>
                        <th style={{ padding: "4px 0" }}>source</th>
                        <th>visits</th>
                        <th>unique devices</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.visitsBySource.map((row) => (
                        <tr key={row.source}>
                          <td style={{ padding: "4px 0" }}>{row.source}</td>
                          <td>{row.visits}</td>
                          <td>{row.uniqueDevices}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  SNS経由の新規登録 / 転換率
                </div>
                {metrics.visitToRegisterRateBySource.length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>データなし</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#64748b" }}>
                        <th style={{ padding: "4px 0" }}>source</th>
                        <th>visits</th>
                        <th>登録</th>
                        <th>転換率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.visitToRegisterRateBySource.map((row) => (
                        <tr key={row.source}>
                          <td style={{ padding: "4px 0" }}>{row.source}</td>
                          <td>{row.visits}</td>
                          <td>{row.registrations}</td>
                          <td>{pct(row.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  SNS経由の通話開始
                </div>
                {metrics.callStartedBySource.length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>データなし</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {metrics.callStartedBySource.map((row) => (
                      <li key={row.source}>
                        {row.source}: {row.count}
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: 6, color: "#64748b" }}>
                  通話成立:{" "}
                  {metrics.callEstablished.measured
                    ? metrics.callEstablished.value
                    : `未計測（${metrics.callEstablished.reason}）`}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  日別の流入推移（UTM付き）
                </div>
                {metrics.dailyVisits.length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>データなし</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {metrics.dailyVisits.map((row) => (
                      <li key={row.day}>
                        {row.day}: {row.visits}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  投稿別の集客効果
                </div>
                {metrics.postPerformance.length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>データなし</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#64748b" }}>
                        <th style={{ padding: "4px 0" }}>utm_content</th>
                        <th>visits</th>
                        <th>登録</th>
                        <th>通話開始</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.postPerformance.slice(0, 20).map((row) => (
                        <tr key={row.utmContent}>
                          <td style={{ padding: "4px 0" }}>
                            <div>{row.utmContent}</div>
                            {row.bodyPreview ? (
                              <div style={{ color: "#94a3b8", fontSize: 12 }}>
                                {row.bodyPreview}
                              </div>
                            ) : null}
                          </td>
                          <td>{row.visits}</td>
                          <td>{row.registrations}</td>
                          <td>{row.callStarted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
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
                    {p.external_status ? ` · ext:${p.external_status}` : ""}
                    {p.generation_source === "template_fallback"
                      ? " · template"
                      : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    生成 {fmt(p.created_at)}
                    {p.scheduled_at ? ` · 予約 ${fmt(p.scheduled_at)}` : ""}
                    {p.external_post_id
                      ? ` · extId ${p.external_post_id.slice(0, 8)}…`
                      : ""}
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
                          "承認しました"
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
                              "予約日時を保存しました"
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

                  {(p.status === "approved" ||
                    p.status === "scheduled" ||
                    p.status === "failed") &&
                  !p.external_post_id ? (
                    <button
                      type="button"
                      style={adminBtn}
                      disabled={busy}
                      onClick={() => void publishToBuffer(p.id)}
                      title={
                        buffer?.connected
                          ? "Bufferへ予約/送信"
                          : "未接続時はエラーになり手動コピーを案内します"
                      }
                    >
                      Bufferへ予約
                    </button>
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
