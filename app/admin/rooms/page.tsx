// app/admin/rooms/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type RoomRow = {
  session_id: string;
  class_id: string | null;
  class_name: string;
  world_key: string | null;
  topic_key: string | null;
  status: string;
  member_count: number;
  started_at: string | null;
  elapsed_minutes: number;
  report_count: number;
  short_leave_count: number;
  join_leave_burst_count: number;
  block_count: number;
  risk_score: number;
  risk_level: "低" | "中" | "高";
};

type Summary = {
  active_room_count: number;
  active_user_count: number;
  dangerous_room_count: number;
};

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

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function riskColor(level: RoomRow["risk_level"]) {
  if (level === "高") return "#b00020";
  if (level === "中") return "#9a6700";
  return "#2d6a4f";
}

export default function AdminRoomsPage() {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    active_room_count: 0,
    active_user_count: 0,
    dangerous_room_count: 0,
  });

  const authed = useMemo(() => pass.trim().length > 0, [pass]);

  useEffect(() => {
    const saved = localStorage.getItem("ADMIN_PASSWORD");
    if (saved) setPass(saved);
  }, []);

  function savePass() {
    localStorage.setItem("ADMIN_PASSWORD", pass.trim());
  }

  async function loadRooms() {
    if (!authed) return;

    setBusy(true);
    setMsg("");

    try {
      savePass();

      const res = await fetch("/api/admin/rooms?limit=100", {
        method: "GET",
        headers: {
          "x-admin-password": pass.trim(),
        },
        cache: "no-store",
      });

      const j = await readJsonOrThrow(res);
      setRooms(j.rooms ?? []);
      setSummary(
        j.summary ?? {
          active_room_count: 0,
          active_user_count: 0,
          dangerous_room_count: 0,
        }
      );
      setMsg(`読み込みOK（rooms: ${(j.rooms ?? []).length}）`);
    } catch (e: any) {
      setMsg(e?.message ?? "load_failed");
    } finally {
      setBusy(false);
    }
  }

  const pageStyle: React.CSSProperties = {
    padding: 16,
    maxWidth: 1200,
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

  return (
    <main style={pageStyle}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>管理：ルーム一覧</h1>
      <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        sessions / session_members / classes をもとに、進行中セッションを一覧表示します。
      </div>

      <section style={{ ...card, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="ADMIN_PASSWORD"
            style={{ ...input, width: 260 }}
          />

          <button
            onClick={loadRooms}
            disabled={!authed || busy}
            style={{ ...btn, opacity: !authed || busy ? 0.6 : 1 }}
          >
            {busy ? "処理中…" : "読み込み"}
          </button>

          <button
            onClick={() => (window.location.href = "/admin/topics")}
            style={btnGhost}
          >
            topicsへ
          </button>

          {msg ? <span style={{ fontSize: 12, color: "#333" }}>{msg}</span> : null}
        </div>
      </section>

      <section
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <div style={card}>
          <div style={{ fontSize: 12, color: "#666" }}>アクティブルーム</div>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>
            {summary.active_room_count}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, color: "#666" }}>アクティブユーザー</div>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>
            {summary.active_user_count}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, color: "#666" }}>危険ルーム</div>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>
            {summary.dangerous_room_count}
          </div>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>進行中ルーム</h2>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1200, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>クラス名</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>world</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>topic</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>人数</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>status</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>開始</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>経過</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>通報</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>短時間退出</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>入退室頻度</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>危険度</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>session_id</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.session_id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                  <td style={{ padding: "8px 6px", fontWeight: 700 }}>
                    {room.class_name}
                  </td>
                  <td style={{ padding: "8px 6px" }}>{room.world_key ?? "-"}</td>
                  <td style={{ padding: "8px 6px" }}>{room.topic_key ?? "-"}</td>
                  <td style={{ padding: "8px 6px" }}>{room.member_count}</td>
                  <td style={{ padding: "8px 6px" }}>{room.status}</td>
                  <td style={{ padding: "8px 6px" }}>{fmtDateTime(room.started_at)}</td>
                  <td style={{ padding: "8px 6px" }}>{room.elapsed_minutes}分</td>
                  <td style={{ padding: "8px 6px" }}>{room.report_count}</td>
                  <td style={{ padding: "8px 6px" }}>{room.short_leave_count}</td>
                  <td style={{ padding: "8px 6px" }}>{room.join_leave_burst_count}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontWeight: 900,
                        color: riskColor(room.risk_level),
                      }}
                    >
                      {room.risk_level} ({room.risk_score})
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "8px 6px",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: 11,
                    }}
                  >
                    {room.session_id}
                  </td>
                </tr>
              ))}

              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 10, color: "#666" }}>
                    進行中ルームがありません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>メモ</h2>
        <div style={{ marginTop: 8, fontSize: 12, color: "#666", lineHeight: 1.8 }}>
          現在のMVPでは、通報数・短時間退出・ブロック数は未接続です。<br />
          そのため危険度は暫定的に「入退室頻度」のみで少しだけ反映されます。<br />
          次に reports / blocks / session_metrics を足すと、ここを本番仕様にできます。
        </div>
      </section>

      <div style={{ height: 24 }} />
    </main>
  );
}