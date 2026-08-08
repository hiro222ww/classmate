"use client";

export const dynamic = "force-dynamic";

import { Fragment, useCallback, useEffect, useState } from "react";

type RecentProfile = {
  display_name: string;
  created_at: string;
  age: number | null;
  gender: "male" | "female";
  gender_label: string;
  user_id: string | null;
  device_id: string;
};

type Summary = {
  today_count: number;
  total_count: number;
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function shortId(id: string | null) {
  if (!id) return "-";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function AdminProfilesPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [day, setDay] = useState("");
  const [summary, setSummary] = useState<Summary>({
    today_count: 0,
    total_count: 0,
  });
  const [recent, setRecent] = useState<RecentProfile[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/profiles?recentLimit=80", {
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
        total_count: Number(json.summary?.total_count ?? 0),
      });
      setRecent(Array.isArray(json.recent) ? json.recent : []);
      setMsg(
        `読み込みOK（今日 ${Number(json.summary?.today_count ?? 0)} 件 / 累計 ${
          Number(json.summary?.total_count ?? 0)
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
        管理：プロフィール登録
      </h1>
      <p style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        サーバー側でプロフィール保存が成功した完了ユーザーです（画面表示だけではカウントしません）。
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
          <div style={{ fontSize: 12, color: "#666" }}>今日のプロフィール登録数</div>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>
            {summary.today_count}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: "#666" }}>累計プロフィール登録数</div>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>
            {summary.total_count}
          </div>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          最近登録したプロフィール
        </h2>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 560,
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>表示名</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>登録日時</th>
                <th style={{ textAlign: "right", padding: "8px 6px" }}>年齢</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>性別</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>詳細</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: "#888" }}>
                    完了プロフィールがありません
                  </td>
                </tr>
              ) : (
                recent.map((profile) => {
                  const key = `${profile.device_id}:${profile.created_at}`;
                  const open = expandedKey === key;
                  return (
                    <Fragment key={key}>
                      <tr style={{ borderBottom: "1px solid #f3f3f3" }}>
                        <td style={{ padding: "8px 6px", fontWeight: 800 }}>
                          {profile.display_name}
                        </td>
                        <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                          {fmtDateTime(profile.created_at)}
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}>
                          {profile.age ?? "-"}
                        </td>
                        <td style={{ padding: "8px 6px" }}>
                          {profile.gender_label}
                        </td>
                        <td style={{ padding: "8px 6px" }}>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedKey(open ? null : key)
                            }
                            style={{
                              ...btnGhost,
                              padding: "6px 10px",
                              fontSize: 12,
                            }}
                          >
                            {open ? "閉じる" : "ID"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td
                            colSpan={5}
                            style={{
                              padding: "8px 10px 12px",
                              background: "#fafafa",
                              fontSize: 12,
                              color: "#444",
                            }}
                          >
                            <div>
                              <strong>user_id:</strong>{" "}
                              <span title={profile.user_id ?? ""}>
                                {profile.user_id
                                  ? shortId(profile.user_id)
                                  : "（未紐付け）"}
                              </span>
                              {profile.user_id ? (
                                <span style={{ marginLeft: 8, color: "#888" }}>
                                  {profile.user_id}
                                </span>
                              ) : null}
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <strong>device_id:</strong>{" "}
                              <span title={profile.device_id}>
                                {shortId(profile.device_id)}
                              </span>
                              <span style={{ marginLeft: 8, color: "#888" }}>
                                {profile.device_id}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
