"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";

type PathCount = { path: string; count: number };

type RecentVisit = {
  id: string;
  user_id: string | null;
  device_id: string | null;
  path: string;
  visited_at: string;
  referrer: string | null;
  display_name: string | null;
};

type Summary = {
  today_count: number;
  today_unique_visitors: number;
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function shortId(id: string | null) {
  if (!id) return "-";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function AdminVisitsPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [day, setDay] = useState("");
  const [summary, setSummary] = useState<Summary>({
    today_count: 0,
    today_unique_visitors: 0,
  });
  const [byPath, setByPath] = useState<PathCount[]>([]);
  const [recent, setRecent] = useState<RecentVisit[]>([]);

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/page-visits?recentLimit=80&pathLimit=40", {
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
          `取得エラー: ${json?.error ?? `HTTP ${res.status}`}${
            json?.detail ? ` (${json.detail})` : ""
          }`
        );
        return;
      }
      setDay(String(json.day ?? ""));
      setSummary({
        today_count: Number(json.summary?.today_count ?? 0),
        today_unique_visitors: Number(json.summary?.today_unique_visitors ?? 0),
      });
      setByPath(Array.isArray(json.by_path) ? json.by_path : []);
      setRecent(Array.isArray(json.recent) ? json.recent : []);
      setMsg(
        `読み込みOK（今日 ${Number(json.summary?.today_count ?? 0)} 件 / 直近 ${
          Array.isArray(json.recent) ? json.recent.length : 0
        } 件）`
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const card: React.CSSProperties = {
    border: "1px solid #ddd",
    borderRadius: 16,
    padding: 14,
    background: "#fff",
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

  return (
    <main
      style={{
        padding: 16,
        maxWidth: 1100,
        margin: "0 auto",
        color: "#111",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
        管理：アクセス履歴
      </h1>
      <p style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        本番ページの訪問ログです（IPは保存しません）。/admin・/api は記録対象外です。
        {day ? ` 集計日（JST）: ${day}` : ""}
      </p>

      <section style={{ ...card, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            style={{ ...btn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "処理中…" : "再読み込み"}
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/admin";
            }}
            style={btnGhost}
          >
            管理トップ
          </button>
          {msg ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>
              {msg}
            </span>
          ) : null}
        </div>
      </section>

      <section
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <div style={card}>
          <div style={{ fontSize: 12, color: "#666" }}>今日のアクセス数</div>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>
            {summary.today_count}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: "#666" }}>今日のユニーク訪問者</div>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>
            {summary.today_unique_visitors}
          </div>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          ページ別アクセス数（今日）
        </h2>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>path</th>
                <th style={{ textAlign: "right", padding: "8px 6px" }}>件数</th>
              </tr>
            </thead>
            <tbody>
              {byPath.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ padding: 12, color: "#888" }}>
                    今日のアクセスはまだありません
                  </td>
                </tr>
              ) : (
                byPath.map((row) => (
                  <tr key={row.path} style={{ borderBottom: "1px solid #f3f3f3" }}>
                    <td style={{ padding: "8px 6px", fontFamily: "monospace" }}>
                      {row.path}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 800 }}>
                      {row.count}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          最近のアクセス
        </h2>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 720,
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>時刻</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>path</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>表示名</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>user</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>device</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: "#888" }}>
                    履歴がありません
                  </td>
                </tr>
              ) : (
                recent.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                      {fmtDateTime(row.visited_at)}
                    </td>
                    <td style={{ padding: "8px 6px", fontFamily: "monospace" }}>
                      {row.path}
                    </td>
                    <td style={{ padding: "8px 6px", fontWeight: 700 }}>
                      {row.display_name || "（未設定）"}
                    </td>
                    <td style={{ padding: "8px 6px" }} title={row.user_id ?? ""}>
                      {shortId(row.user_id)}
                    </td>
                    <td style={{ padding: "8px 6px" }} title={row.device_id ?? ""}>
                      {shortId(row.device_id)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
