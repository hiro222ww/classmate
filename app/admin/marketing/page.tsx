"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
  tokenPresent?: boolean;
  credentialsPresent: boolean;
  publishEnabled: boolean;
  connected: boolean;
  channelIdConfigured?: boolean;
  note: string;
};

type BufferChannelRow = {
  id: string;
  name: string;
  service: string;
  displayName: string | null;
  descriptor: string | null;
  externalLink: string | null;
  isDisconnected: boolean | null;
  isLocked: boolean | null;
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
  return (
    <Suspense
      fallback={
        <main style={adminPageMain}>
          <div style={adminPageInner}>
            <p style={{ color: "#64748b", fontSize: 13 }}>読み込み中…</p>
          </div>
        </main>
      }
    >
      <AdminMarketingPageInner />
    </Suspense>
  );
}

function AdminMarketingPageInner() {
  const searchParams = useSearchParams();
  const focusPostId = String(searchParams.get("post") ?? "").trim();
  const [posts, setPosts] = useState<MarketingPostRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openaiConfigured, setOpenaiConfigured] = useState<boolean | null>(null);
  const [cronEnabled, setCronEnabled] = useState(false);
  const [weeklyCronEnabled, setWeeklyCronEnabled] = useState(false);
  const [activeStrategyLabel, setActiveStrategyLabel] = useState<string | null>(
    null
  );
  const [buffer, setBuffer] = useState<BufferStatus | null>(null);
  const [activeAdapter, setActiveAdapter] = useState<"buffer" | "manual">(
    "manual"
  );
  const [bufferChannels, setBufferChannels] = useState<BufferChannelRow[]>([]);
  const [bufferMatchId, setBufferMatchId] = useState<string | null>(null);
  const [bufferProbeMsg, setBufferProbeMsg] = useState("");
  const [bufferProbing, setBufferProbing] = useState(false);
  const [metrics, setMetrics] = useState<MarketingDashboardMetrics | null>(null);
  const [metricsMsg, setMetricsMsg] = useState("");
  const [reports, setReports] = useState<
    Array<{
      id: string;
      report_kind: string;
      status: string;
      created_at: string;
      model_name: string | null;
    }>
  >([]);
  const [selectedReport, setSelectedReport] = useState<{
    id: string;
    analysis_markdown: string | null;
    ui_suggestions: unknown;
    strategy_suggestions: unknown;
    uncertainty_notes: string[] | null;
  } | null>(null);
  const [strategies, setStrategies] = useState<
    Array<{ id: string; version: number; label: string; status: string }>
  >([]);
  const [proposals, setProposals] = useState<
    Array<{
      id: string;
      category: string;
      area: string;
      title: string;
      summary: string;
      priority: string;
      status: string;
      created_at: string;
      validation_kpi: string | null;
    }>
  >([]);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyHint, setNotifyHint] = useState("");
  const [phase4Msg, setPhase4Msg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [immediateEnabled, setImmediateEnabled] = useState<boolean | null>(
    null
  );
  const [immediateForceOff, setImmediateForceOff] = useState(false);

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
      setWeeklyCronEnabled(Boolean(json.weeklyCronEnabled));
      setActiveStrategyLabel(
        json.activeStrategy
          ? `v${json.activeStrategy.version}: ${json.activeStrategy.label}`
          : null
      );
      if (json.buffer) setBuffer(json.buffer as BufferStatus);
      if (json.activeAdapter === "buffer" || json.activeAdapter === "manual") {
        setActiveAdapter(json.activeAdapter);
      }
    }
    const gateRes = await fetch("/api/admin/marketing/immediate-publish", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const gateJson = await gateRes.json().catch(() => null);
    if (gateRes.ok && gateJson?.ok) {
      setImmediateEnabled(Boolean(gateJson.enabled));
      setImmediateForceOff(Boolean(gateJson.forceOff));
    }
  }, []);

  const loadPhase4 = useCallback(async () => {
    setPhase4Msg("");
    const [rRes, sRes, pRes] = await Promise.all([
      fetch("/api/admin/marketing/reports", {
        cache: "no-store",
        credentials: "same-origin",
      }),
      fetch("/api/admin/marketing/strategies", {
        cache: "no-store",
        credentials: "same-origin",
      }),
      fetch("/api/admin/marketing/proposals?status=open", {
        cache: "no-store",
        credentials: "same-origin",
      }),
    ]);
    const rJson = await rRes.json().catch(() => null);
    const sJson = await sRes.json().catch(() => null);
    const pJson = await pRes.json().catch(() => null);
    if (rRes.ok && rJson?.ok) {
      setReports(rJson.reports ?? []);
    } else {
      setReports([]);
      setPhase4Msg(
        String(rJson?.detail || rJson?.error || "レポート読込失敗") +
          (rJson?.migrationHint ? ` / ${rJson.migrationHint}` : "")
      );
    }
    if (sRes.ok && sJson?.ok) {
      setStrategies(sJson.versions ?? []);
      if (sJson.active) {
        setActiveStrategyLabel(`v${sJson.active.version}: ${sJson.active.label}`);
      }
    }
    if (pRes.ok && pJson?.ok) {
      setProposals(pJson.proposals ?? []);
      setNotifyEnabled(Boolean(pJson.notifyEnabled));
      setNotifyHint(
        String(pJson.notifyCapability?.reason || pJson.weeklyScheduleHint || "")
      );
    } else {
      setProposals([]);
      if (pJson?.error) {
        setPhase4Msg((prev) =>
          prev ||
          String(pJson?.detail || pJson?.error || "提案読込失敗") +
            (String(pJson?.error || "").includes("relation") ||
            String(pJson?.detail || "").includes("does not exist")
              ? " / マイグレーション 20261117180000 未適用の可能性"
              : "")
        );
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

  async function probeBuffer() {
    setBufferProbing(true);
    setBufferProbeMsg("");
    try {
      const res = await fetch(
        "/api/admin/marketing/buffer?probe=1&match=classmate0401",
        { cache: "no-store", credentials: "same-origin" }
      );
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        setBufferProbeMsg("未ログインまたは認証切れです。");
        return;
      }
      if (json?.buffer) setBuffer(json.buffer as BufferStatus);
      setBufferChannels((json?.channels ?? []) as BufferChannelRow[]);
      const suggested = json?.match?.suggestedChannelId
        ? String(json.match.suggestedChannelId)
        : null;
      setBufferMatchId(suggested);
      if (!json?.ok) {
        setBufferProbeMsg(
          String(json?.detail || json?.error || "Buffer接続確認に失敗しました")
        );
        return;
      }
      setBufferProbeMsg(
        suggested
          ? `接続OK。classmate0401 候補チャンネルID: ${suggested}（キーは表示しません）`
          : `接続OK。チャンネル ${Number(json?.channels?.length ?? 0)} 件。classmate0401 の自動一致なし — 一覧から確認してください`
      );
    } finally {
      setBufferProbing(false);
    }
  }

  useEffect(() => {
    void load();
    void loadMeta();
    void loadMetrics();
    void loadPhase4();
  }, [load, loadMeta, loadMetrics, loadPhase4]);

  async function runWeeklyAnalysis() {
    setBusy(true);
    setPhase4Msg("");
    try {
      const res = await fetch("/api/admin/marketing/reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activateStrategy: false }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setPhase4Msg(String(json?.detail || json?.error || "分析に失敗しました"));
        return;
      }
      setPhase4Msg(
        `週次分析完了（report=${String(json.reportId).slice(0, 8)}…）` +
          (json.usedFallbackAnalysis ? "・ヒューリスティック" : "") +
          `。提案 ${Number(json.proposalsCreated ?? 0)} 件` +
          (json.proposalsSkippedDup
            ? `（重複スキップ ${json.proposalsSkippedDup}）`
            : "") +
          "。手動実行のため方針は draft（Cron時のみ方針自動適用）"
      );
      await loadPhase4();
      await loadMeta();
    } finally {
      setBusy(false);
    }
  }

  async function reviewProposal(
    id: string,
    action: "accept" | "hold" | "reject"
  ) {
    setBusy(true);
    setPhase4Msg("");
    try {
      const res = await fetch("/api/admin/marketing/proposals", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setPhase4Msg(String(json?.detail || json?.error || "提案の更新に失敗"));
        return;
      }
      setPhase4Msg(
        action === "accept"
          ? "提案を採用しました（UI/画像の本番反映は別途手動）"
          : action === "hold"
            ? "提案を保留しました"
            : "提案を却下しました"
      );
      await loadPhase4();
    } finally {
      setBusy(false);
    }
  }

  async function openReport(id: string) {
    const res = await fetch(`/api/admin/marketing/reports?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok || !json.report) {
      setPhase4Msg(String(json?.detail || json?.error || "レポート詳細の読込失敗"));
      return;
    }
    setSelectedReport(json.report);
  }

  async function setStrategyActive(id: string | null) {
    setBusy(true);
    setPhase4Msg("");
    try {
      const res = await fetch("/api/admin/marketing/strategies", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          id ? { action: "activate", id } : { action: "deactivate" }
        ),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setPhase4Msg(String(json?.detail || json?.error || "方針の更新に失敗"));
        return;
      }
      setPhase4Msg(id ? "改善方針を適用しました（投稿生成のみ）" : "改善方針を無効化しました");
      await loadPhase4();
      await loadMeta();
    } finally {
      setBusy(false);
    }
  }

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

  const focusedPost = useMemo(
    () => (focusPostId ? posts.find((p) => p.id === focusPostId) ?? null : null),
    [focusPostId, posts]
  );

  // Deep link from Discord/email: keep the target post visible in the list.
  useEffect(() => {
    if (!focusedPost) return;
    if (filter !== "all" && filter !== focusedPost.status) {
      setFilter("all");
    }
  }, [focusedPost, filter]);

  useEffect(() => {
    if (!focusPostId || busy) return;
    const el = document.getElementById(`marketing-post-${focusPostId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusPostId, visiblePosts, busy, focusedPost]);

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
          : `AI投稿案を3件生成しました（draft）${json.qualityRetried ? "・品質再生成あり" : ""}`
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function seedCalendar() {
    if (
      !window.confirm(
        "2週間分の投稿カレンダーを下書きとして投入します（未公開）。続行しますか？"
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/marketing/calendar", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(
          String(json?.detail || json?.error || "カレンダー投入に失敗しました")
        );
        return;
      }
      setMsg(
        `14日カレンダーを ${json.count} 件投入しました（start=${json.startYmd}・すべて draft）`
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

  async function approveAndPublishNow(id: string) {
    if (publishingId) return;
    const target = posts.find((p) => p.id === id);
    const preview = String(target?.body_text ?? "").slice(0, 160);
    const okConfirm = window.confirm(
      `この投稿を X (@classmate0401) へ今すぐ公開しますか？\n\n` +
        `${preview}${preview.length >= 160 ? "…" : ""}\n\n` +
        `送信先: Buffer → X (@classmate0401)\n` +
        `URL: ${target?.tracking_url || "（UTMなし）"}\n\n` +
        `二重送信防止あり。結果不明のときは自動再送しません。`
    );
    if (!okConfirm) return;

    setPublishingId(id);
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/marketing/publish-now", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(
          String(
            json?.detail ||
              json?.error ||
              "今すぐ投稿に失敗しました"
          ) +
            (json?.outcome === "unknown"
              ? "（結果不明・自動再送なし。Buffer/Xを確認）"
              : "")
        );
        await load();
        return;
      }
      const outcome = String(json.outcome || "");
      setMsg(
        outcome === "x_published"
          ? `Xへ公開しました${json.externalPermalink ? ` — ${json.externalPermalink}` : ""}`
          : outcome === "buffer_accepted"
            ? "Bufferは受付済み（X反映確認中）"
            : "公開処理を受け付けました"
      );
      await load();
    } finally {
      setPublishingId(null);
      setBusy(false);
    }
  }

  async function toggleImmediatePublish(next: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/marketing/immediate-publish", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(String(json?.detail || json?.error || "ゲート更新に失敗"));
        return;
      }
      setImmediateEnabled(Boolean(json.enabled));
      setMsg(
        json.enabled
          ? "即時投稿ゲートをONにしました（再デプロイ不要）"
          : "即時投稿ゲートをOFFにしました"
      );
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
              Phase 4: 週次分析・改善方針フィードバック。SNS自動公開・UI自動変更はしません。
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13 }}>
              <Link href="/admin/marketing/charter">AI運営憲章（理念・方針DB）</Link>
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
              style={adminBtnGhost}
              disabled={busy}
              onClick={() => void seedCalendar()}
            >
              14日カレンダー投入
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
              予約送信ゲート(env):{" "}
              {buffer?.publishEnabled
                ? "有効（Bufferへ予約）"
                : "無効（MARKETING_BUFFER_PUBLISH_ENABLED≠1）"}
            </div>
            <div>
              即時投稿ゲート(DB・再デプロイ不要):{" "}
              {immediateForceOff
                ? "FORCE_OFF"
                : immediateEnabled == null
                  ? "確認中…"
                  : immediateEnabled
                    ? "ON（承認して今すぐ投稿が使える）"
                    : "OFF"}
            </div>
            <div>
              Cron（日次生成）:{" "}
              {cronEnabled ? "有効" : "無効（MARKETING_CRON_ENABLED≠1）"}
            </div>
            <div>
              Cron（週次分析）:{" "}
              {weeklyCronEnabled
                ? "有効"
                : "無効（MARKETING_WEEKLY_CRON_ENABLED≠1）"}
            </div>
            <div>
              適用中の改善方針: {activeStrategyLabel ?? "なし（デフォルト生成）"}
            </div>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={adminBtnGhost}
              disabled={busy || bufferProbing}
              onClick={() => void probeBuffer()}
            >
              Buffer接続確認（チャンネル一覧・投稿なし）
            </button>
            <button
              type="button"
              style={adminBtnGhost}
              disabled={busy || immediateForceOff || immediateEnabled == null}
              onClick={() =>
                void toggleImmediatePublish(!(immediateEnabled === true))
              }
            >
              即時投稿ゲートを
              {immediateEnabled ? "OFF" : "ON"}
            </button>
          </div>
          {bufferProbeMsg ? (
            <p style={{ margin: "10px 0 0", color: "#0f766e", fontSize: 13 }}>
              {bufferProbeMsg}
            </p>
          ) : null}
          {bufferMatchId ? (
            <p style={{ margin: "8px 0 0", fontSize: 13 }}>
              推奨 <code>BUFFER_CHANNEL_ID</code>:{" "}
              <button
                type="button"
                style={{
                  ...adminBtnGhost,
                  padding: "4px 8px",
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
                onClick={() => void copyText(bufferMatchId)}
              >
                {bufferMatchId}
              </button>
            </p>
          ) : null}
          {bufferChannels.length > 0 ? (
            <div style={{ marginTop: 12, fontSize: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "4px 0" }}>service</th>
                    <th>name</th>
                    <th>id</th>
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {bufferChannels.map((ch) => (
                    <tr
                      key={ch.id}
                      style={{
                        background:
                          bufferMatchId === ch.id ? "#ecfdf5" : undefined,
                      }}
                    >
                      <td style={{ padding: "4px 0" }}>{ch.service}</td>
                      <td>
                        {ch.name}
                        {ch.displayName ? ` (${ch.displayName})` : ""}
                      </td>
                      <td>
                        <button
                          type="button"
                          style={{
                            ...adminBtnGhost,
                            padding: "2px 6px",
                            fontSize: 11,
                            fontFamily: "monospace",
                          }}
                          onClick={() => void copyText(ch.id)}
                        >
                          {ch.id}
                        </button>
                      </td>
                      <td>
                        {ch.isDisconnected
                          ? "切断"
                          : ch.isLocked
                            ? "ロック"
                            : "OK"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
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

        <section
          style={{
            ...adminCard,
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <strong>Phase 4: 週次分析・改善方針</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={adminBtn}
                disabled={busy}
                onClick={() => void runWeeklyAnalysis()}
              >
                手動で週次分析
              </button>
              <button
                type="button"
                style={adminBtnGhost}
                disabled={busy}
                onClick={() => void loadPhase4()}
              >
                再読込
              </button>
            </div>
          </div>
          <p style={{ margin: "0 0 8px", color: "#667085" }}>
            週次Cron（日曜20:00 JST・既定OFF）で分析・提案・運営者通知。SNS投稿方針はCron時に自動適用可。SNS公開・UI/画像変更は承認必須。
          </p>
          <p style={{ margin: "0 0 8px", color: "#667085", fontSize: 12 }}>
            通知: {notifyEnabled ? "有効" : "無効（MARKETING_ADMIN_NOTIFY_ENABLED）"}
            {notifyHint ? ` — ${notifyHint}` : ""}
          </p>
          {phase4Msg ? (
            <p style={{ color: phase4Msg.includes("失敗") ? "#b91c1c" : "#166534" }}>
              {phase4Msg}
            </p>
          ) : null}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              改善提案（採用 / 保留 / 却下）
            </div>
            {proposals.length === 0 ? (
              <div style={{ color: "#94a3b8" }}>未処理の提案はありません</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {proposals.map((p) => (
                  <li key={p.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 700 }}>
                      [{p.priority}] {p.area}: {p.title}{" "}
                      <span style={{ color: "#64748b", fontWeight: 500 }}>
                        ({p.status})
                      </span>
                    </div>
                    <div style={{ color: "#475569" }}>{p.summary}</div>
                    {p.validation_kpi ? (
                      <div style={{ color: "#64748b", fontSize: 12 }}>
                        KPI: {p.validation_kpi} · {fmt(p.created_at)}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        style={{ ...adminBtnGhost, padding: "2px 8px", fontSize: 12 }}
                        disabled={busy}
                        onClick={() => void reviewProposal(p.id, "accept")}
                      >
                        採用
                      </button>
                      <button
                        type="button"
                        style={{ ...adminBtnGhost, padding: "2px 8px", fontSize: 12 }}
                        disabled={busy}
                        onClick={() => void reviewProposal(p.id, "hold")}
                      >
                        保留
                      </button>
                      <button
                        type="button"
                        style={{ ...adminBtnGhost, padding: "2px 8px", fontSize: 12 }}
                        disabled={busy}
                        onClick={() => void reviewProposal(p.id, "reject")}
                      >
                        却下
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>週次レポート履歴</div>
              {reports.length === 0 ? (
                <div style={{ color: "#94a3b8" }}>まだありません</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {reports.slice(0, 8).map((r) => (
                    <li key={r.id} style={{ marginBottom: 4 }}>
                      <button
                        type="button"
                        style={{
                          ...adminBtnGhost,
                          padding: "2px 8px",
                          fontSize: 12,
                        }}
                        onClick={() => void openReport(r.id)}
                      >
                        {fmt(r.created_at)} · {r.status}
                        {r.model_name ? ` · ${r.model_name}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                改善方針（適用は投稿生成のみ）
              </div>
              <div style={{ marginBottom: 8 }}>
                次回投稿への反映:{" "}
                {activeStrategyLabel ? (
                  <span style={{ color: "#166534" }}>{activeStrategyLabel}</span>
                ) : (
                  <span style={{ color: "#94a3b8" }}>未適用（デフォルト）</span>
                )}
              </div>
              <button
                type="button"
                style={{ ...adminBtnGhost, marginBottom: 8 }}
                disabled={busy || !activeStrategyLabel}
                onClick={() => void setStrategyActive(null)}
              >
                適用中の方針を無効化
              </button>
              {strategies.length === 0 ? (
                <div style={{ color: "#94a3b8" }}>履歴なし</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {strategies.slice(0, 12).map((s) => (
                    <li key={s.id} style={{ marginBottom: 6 }}>
                      v{s.version}: {s.label}{" "}
                      <span style={{ color: "#64748b" }}>({s.status})</span>{" "}
                      {s.status !== "active" ? (
                        <button
                          type="button"
                          style={{
                            ...adminBtnGhost,
                            padding: "2px 8px",
                            fontSize: 12,
                          }}
                          disabled={busy}
                          onClick={() => void setStrategyActive(s.id)}
                        >
                          適用
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {selectedReport ? (
            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <strong>レポート詳細</strong>
                <button
                  type="button"
                  style={adminBtnGhost}
                  onClick={() => setSelectedReport(null)}
                >
                  閉じる
                </button>
              </div>
              {selectedReport.uncertainty_notes?.length ? (
                <div style={{ marginBottom: 8, color: "#92400e" }}>
                  不確実性: {selectedReport.uncertainty_notes.join(" / ")}
                </div>
              ) : null}
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  background: "#f8fafc",
                  padding: 12,
                  borderRadius: 8,
                  maxHeight: 360,
                  overflow: "auto",
                }}
              >
                {selectedReport.analysis_markdown || "（本文なし）"}
              </pre>
              {Array.isArray(selectedReport.ui_suggestions) &&
              selectedReport.ui_suggestions.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    UI・UX / ヒーロー画像の改善案
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {(
                      selectedReport.ui_suggestions as Array<{
                        area?: string;
                        title?: string;
                        reason?: string;
                        evidence?: string;
                        evidenceKind?: string;
                        priority?: string;
                        validationKpi?: string;
                        imagePrompt?: string | null;
                        compositionNotes?: string | null;
                      }>
                    ).map((u, i) => (
                      <li key={i} style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 700 }}>
                          [{u.priority ?? "?"}] {u.area}: {u.title}
                        </div>
                        <div style={{ color: "#475569" }}>{u.reason}</div>
                        <div style={{ color: "#64748b", fontSize: 12 }}>
                          根拠種別: {u.evidenceKind}
                          {u.evidence ? ` — ${u.evidence}` : ""} / KPI:{" "}
                          {u.validationKpi}
                        </div>
                        {u.imagePrompt ? (
                          <div style={{ marginTop: 4, fontSize: 12 }}>
                            画像プロンプト: {u.imagePrompt}
                          </div>
                        ) : null}
                        {u.compositionNotes ? (
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            構図: {u.compositionNotes}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {selectedReport.strategy_suggestions ? (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                    AIによる投稿改善提案（JSON）
                  </summary>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: 11,
                      background: "#f8fafc",
                      padding: 12,
                      borderRadius: 8,
                      marginTop: 8,
                    }}
                  >
                    {JSON.stringify(selectedReport.strategy_suggestions, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </section>

        {focusPostId ? (
          <section
            style={{
              ...adminCard,
              marginBottom: 14,
              border: "2px solid #0f766e",
              background: "#f0fdfa",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: "#115e59" }}>
              Discord / 通知からのレビュー対象
            </div>
            {focusedPost ? (
              <>
                <p
                  style={{
                    margin: "8px 0 0",
                    whiteSpace: "pre-wrap",
                    fontSize: 15,
                    lineHeight: 1.5,
                    fontWeight: 700,
                  }}
                >
                  {focusedPost.body_text}
                </p>
                <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
                  {MARKETING_POST_TYPE_LABELS[focusedPost.post_type] ??
                    focusedPost.post_type}{" "}
                  · {MARKETING_STATUS_LABELS[focusedPost.status]}
                  {typeof focusedPost.quality_score === "number"
                    ? ` · 品質 ${focusedPost.quality_score}`
                    : ""}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
                  送信先: Buffer → X (@classmate0401)
                  <br />
                  URL: {focusedPost.tracking_url || "（UTMなし）"}
                  {focusedPost.external_permalink ? (
                    <>
                      <br />
                      X投稿:{" "}
                      <a
                        href={focusedPost.external_permalink}
                        style={{ color: "#0369a1" }}
                      >
                        {focusedPost.external_permalink}
                      </a>
                    </>
                  ) : null}
                </div>
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "#b45309" }}>
                  「承認して今すぐ投稿」だけが公開トリガーです。AI/Cronは自動投稿しません。
                </p>
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {!focusedPost.external_post_id &&
                  focusedPost.status !== "published" ? (
                    <button
                      type="button"
                      style={adminBtn}
                      disabled={
                        busy ||
                        publishingId === focusedPost.id ||
                        immediateEnabled === false
                      }
                      onClick={() => void approveAndPublishNow(focusedPost.id)}
                    >
                      {publishingId === focusedPost.id
                        ? "投稿中…"
                        : "承認して今すぐ投稿"}
                    </button>
                  ) : null}
                  {focusedPost.status === "draft" ||
                  focusedPost.status === "rejected" ? (
                    <button
                      type="button"
                      style={adminBtnGhost}
                      disabled={busy}
                      onClick={() =>
                        void patchPost(
                          focusedPost.id,
                          { status: "approved" },
                          "承認しました（SNS未公開）"
                        )
                      }
                    >
                      承認のみ
                    </button>
                  ) : null}
                  {focusedPost.status !== "rejected" &&
                  focusedPost.status !== "published" ? (
                    <button
                      type="button"
                      style={adminBtnGhost}
                      disabled={busy}
                      onClick={() =>
                        void patchPost(
                          focusedPost.id,
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
                  <a
                    href={`#marketing-post-${focusedPost.id}`}
                    style={{
                      ...adminBtnGhost,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    詳細へスクロール
                  </a>
                </div>
              </>
            ) : (
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#b91c1c" }}>
                指定の投稿（{focusPostId.slice(0, 8)}…）が見つかりません。削除済みか、別環境のIDの可能性があります。
              </p>
            )}
          </section>
        ) : null}

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
              <article
                key={p.id}
                id={`marketing-post-${p.id}`}
                style={{
                  ...adminCard,
                  ...(p.id === focusPostId
                    ? {
                        border: "2px solid #0f766e",
                        boxShadow: "0 0 0 3px rgba(15,118,110,0.15)",
                      }
                    : null),
                  scrollMarginTop: 16,
                }}
              >
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
                    {MARKETING_POST_TYPE_LABELS[p.post_type] ?? p.post_type} ·{" "}
                    {p.channel} · {MARKETING_STATUS_LABELS[p.status]}
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
                  <div>期待行動: {p.expected_action || "—"}</div>
                  <div>CTA: {p.cta || "—"}</div>
                  {typeof p.quality_score === "number" ? (
                    <div>
                      品質スコア: {p.quality_score}
                      {p.quality_notes ? `（${p.quality_notes}）` : ""}
                    </div>
                  ) : null}
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
                  {p.external_permalink ? (
                    <div>
                      X投稿:{" "}
                      <a
                        href={p.external_permalink}
                        style={{ color: "#0369a1" }}
                      >
                        {p.external_permalink}
                      </a>
                    </div>
                  ) : null}
                  {p.publish_outcome ? (
                    <div>公開結果: {p.publish_outcome}</div>
                  ) : null}
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

                  {!p.external_post_id &&
                  p.status !== "published" &&
                  (p.status === "draft" ||
                    p.status === "approved" ||
                    p.status === "scheduled" ||
                    p.status === "failed" ||
                    p.status === "rejected") ? (
                    <button
                      type="button"
                      style={adminBtn}
                      disabled={
                        busy || publishingId === p.id || immediateEnabled === false
                      }
                      onClick={() => void approveAndPublishNow(p.id)}
                    >
                      {publishingId === p.id
                        ? "投稿中…"
                        : "承認して今すぐ投稿"}
                    </button>
                  ) : null}

                  {p.status === "draft" || p.status === "rejected" ? (
                    <button
                      type="button"
                      style={adminBtnGhost}
                      disabled={busy}
                      onClick={() =>
                        void patchPost(
                          p.id,
                          { status: "approved" },
                          "承認しました（SNS未公開）"
                        )
                      }
                    >
                      承認のみ
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
