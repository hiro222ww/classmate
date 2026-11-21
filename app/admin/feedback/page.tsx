"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminBtn,
  adminBtnGhost,
  adminCard,
  adminPageInner,
  adminPageMain,
} from "@/app/admin/adminUi";

type Item = {
  id: string;
  category: string;
  body_raw: string;
  body_redacted: string;
  status: string;
  ai_category: string | null;
  ai_summary: string | null;
  ai_severity: string | null;
  safety_flag: boolean;
  call_impact: string;
  cluster_id: string | null;
  created_at: string;
  admin_note: string | null;
};

type Cluster = {
  id: string;
  title: string;
  summary: string;
  category: string;
  severity: string;
  status: string;
  report_count: number;
  unique_reporter_count: number;
  call_impact: string;
  safety_flag: boolean;
  last_seen_at: string;
};

function fmt(iso: string) {
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

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const [iRes, cRes] = await Promise.all([
        fetch(`/api/admin/feedback?view=items&status=${encodeURIComponent(status)}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch(`/api/admin/feedback?view=clusters&status=${encodeURIComponent(status)}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);
      const iJson = await iRes.json().catch(() => null);
      const cJson = await cRes.json().catch(() => null);
      if (!iRes.ok || !iJson?.ok) {
        setMsg(
          String(iJson?.detail || iJson?.error || "読込失敗") +
            (iJson?.migrationHint ? ` / ${iJson.migrationHint}` : "")
        );
        setItems([]);
      } else {
        setItems(iJson.items ?? []);
      }
      if (cRes.ok && cJson?.ok) setClusters(cJson.clusters ?? []);
    } finally {
      setBusy(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    id: string,
    action: "accept" | "hold" | "resolve" | "dismiss",
    target: "item" | "cluster" = "item"
  ) {
    let note: string | null = null;
    if (action === "dismiss" || action === "resolve") {
      note = window.prompt("管理メモ（安全関連の却下時は必須）", "") ?? "";
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action, target, note }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(String(json?.detail || json?.error || "更新失敗"));
        return;
      }
      setMsg("更新しました");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={adminPageMain}>
      <div style={adminPageInner}>
        <div style={{ marginBottom: 12 }}>
          <Link href="/admin">← 管理ホーム</Link>
        </div>
        <h1 style={{ marginTop: 0 }}>ユーザーフィードバック</h1>
        <p style={{ color: "#64748b" }}>
          製品フィードバック（不具合・要望）。ユーザー間の通報は
          <Link href="/admin/reports"> 通報管理</Link>へ。安全フラグ付きはAI単独却下禁止。
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {(["open", "all", "resolved", "dismissed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              style={status === s ? adminBtn : adminBtnGhost}
              disabled={busy}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
          <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void load()}>
            再読込
          </button>
        </div>
        {msg ? <p>{msg}</p> : null}

        <section style={{ ...adminCard, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>テーマ（クラスタ）</h2>
          {clusters.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>なし</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {clusters.map((c) => (
                <li key={c.id} style={{ marginBottom: 10 }}>
                  <strong>
                    [{c.severity}] {c.title}
                  </strong>{" "}
                  <span style={{ color: "#64748b" }}>
                    声{c.unique_reporter_count}/件{c.report_count} · {c.status}
                    {c.safety_flag ? " · 安全" : ""}
                  </span>
                  <div style={{ color: "#475569" }}>{c.summary}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void act(c.id, "accept", "cluster")}>
                      採用
                    </button>
                    <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void act(c.id, "hold", "cluster")}>
                      保留
                    </button>
                    <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void act(c.id, "resolve", "cluster")}>
                      対応済み
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={adminCard}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>個別フィードバック</h2>
          {items.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>なし</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {items.map((it) => (
                <li key={it.id} style={{ marginBottom: 14 }}>
                  <div>
                    <strong>
                      [{it.ai_severity ?? "?"}] {it.ai_category ?? it.category}
                    </strong>{" "}
                    <span style={{ color: "#64748b" }}>
                      {fmt(it.created_at)} · {it.status}
                      {it.safety_flag ? " · 安全" : ""}
                      {it.call_impact !== "none" ? ` · 通話:${it.call_impact}` : ""}
                    </span>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{it.body_raw}</div>
                  {it.ai_summary ? (
                    <div style={{ color: "#64748b", fontSize: 12 }}>
                      AI要約（マスク後）: {it.ai_summary}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void act(it.id, "accept")}>
                      採用
                    </button>
                    <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void act(it.id, "hold")}>
                      保留
                    </button>
                    <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void act(it.id, "resolve")}>
                      対応済み
                    </button>
                    <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void act(it.id, "dismiss")}>
                      却下
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
