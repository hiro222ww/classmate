"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import ClassRepairPanel from "./ClassRepairPanel";

type RoomMember = {
  device_id: string;
  display_name: string | null;
  joined_at: string | null;
};

type RoomRepairSummary = {
  class_memberships: number;
  session_members: number;
  class_presence: number;
  members_missing_membership: number;
  possible_split_sessions: number;
};

type RoomRow = {
  session_id: string;
  class_id: string | null;
  class_name: string;
  world_key: string | null;
  topic_key: string | null;
  status: string;
  member_count: number;
  members: RoomMember[];
  repair_summary: RoomRepairSummary | null;
  started_at: string | null;
  created_at: string | null;
  updated_at: string | null;
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

type LoadState = "idle" | "success" | "empty" | "auth_error" | "fetch_error";

async function readJsonResponse(r: Response) {
  const raw = await r.text();
  const ct = r.headers.get("content-type") ?? "";

  if (!ct.includes("application/json")) {
    console.error("[admin/rooms-ui] non-json response", {
      status: r.status,
      raw,
    });
    throw new Error("non_json_response");
  }

  return JSON.parse(raw) as {
    ok?: boolean;
    error?: string;
    detail?: string;
    rooms?: RoomRow[];
    summary?: Summary;
  };
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

function shortId(id: string) {
  if (!id) return "-";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function riskColor(level: RoomRow["risk_level"]) {
  if (level === "高") return "#b00020";
  if (level === "中") return "#9a6700";
  return "#2d6a4f";
}

function riskBg(level: RoomRow["risk_level"]) {
  if (level === "高") return "#fff1f1";
  if (level === "中") return "#fff8e1";
  return "#fff";
}

export default function AdminRoomsPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    active_room_count: 0,
    active_user_count: 0,
    dangerous_room_count: 0,
  });
  const [repairClassId, setRepairClassId] = useState("");
  const [repairSessionId, setRepairSessionId] = useState("");
  const [repairDeviceId, setRepairDeviceId] = useState("");

  const emptySummary: Summary = {
    active_room_count: 0,
    active_user_count: 0,
    dangerous_room_count: 0,
  };

  async function loadRooms() {
    setBusy(true);
    setMsg("");
    setLoadState("idle");

    try {
      const res = await fetch("/api/admin/rooms?limit=100", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (res.status === 401) {
        console.warn("[admin/rooms-ui] auth error", { status: 401 });
        setRooms([]);
        setSummary(emptySummary);
        setLoadState("auth_error");
        setMsg("未ログインまたは認証切れです。再ログインしてください。");
        return;
      }

      const j = await readJsonResponse(res);

      if (!res.ok || !j.ok) {
        console.error("[admin/rooms-ui] fetch failed", {
          status: res.status,
          error: j.error,
          detail: j.detail,
        });
        setRooms([]);
        setSummary(emptySummary);
        setLoadState("fetch_error");
        setMsg(
          `取得エラー: ${j.error ?? `HTTP ${res.status}`}${
            j.detail ? ` (${j.detail})` : ""
          }`
        );
        return;
      }

      const nextRooms = j.rooms ?? [];
      setRooms(nextRooms);
      setSummary(j.summary ?? emptySummary);

      if (nextRooms.length === 0) {
        console.log("[admin/rooms-ui] fetch ok, empty", { count: 0 });
        setLoadState("empty");
        setMsg("読み込みOK — 表示対象ルームは0件です");
        return;
      }

      console.log("[admin/rooms-ui] fetch ok", { count: nextRooms.length });
      setLoadState("success");
      setMsg(`読み込みOK（rooms: ${nextRooms.length}）`);
    } catch (e: any) {
      console.error("[admin/rooms-ui] unexpected error", e);
      setRooms([]);
      setSummary(emptySummary);
      setLoadState("fetch_error");
      setMsg(e?.message ?? "load_failed");
    } finally {
      setBusy(false);
    }
  }

  const pageStyle: React.CSSProperties = {
    padding: 16,
    maxWidth: 1280,
    margin: "0 auto",
    color: "#111",
  };

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

  const msgColor =
    loadState === "auth_error" || loadState === "fetch_error"
      ? "#b00020"
      : loadState === "empty"
        ? "#92400e"
        : "#333";

  const emptyTableMessage =
    loadState === "idle"
      ? "「読み込み」を押してください"
      : loadState === "auth_error"
        ? "認証エラー: 未ログインまたは認証切れです"
        : loadState === "fetch_error"
          ? "取得エラー: 上のメッセージを確認してください"
          : loadState === "empty"
            ? "表示対象ルームは0件です（API成功）"
            : "進行中ルームがありません";

  return (
    <main style={pageStyle}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
        管理：ルーム一覧
      </h1>

      <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        session_members に参加者がいる、終了前の session を一覧表示します（classes は補助情報）。
      </div>

      <section style={{ ...card, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={loadRooms}
            disabled={busy}
            style={{ ...btn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "処理中…" : "読み込み"}
          </button>

          <button onClick={() => (window.location.href = "/admin")} style={btnGhost}>
            管理トップ
          </button>

          <button onClick={() => (window.location.href = "/admin/topics")} style={btnGhost}>
            topicsへ
          </button>

          <button onClick={() => (window.location.href = "/admin/voice")} style={btnGhost}>
            voiceへ
          </button>

          {loadState === "auth_error" ? (
            <button
              onClick={() => {
                window.location.href = "/admin/login?next=/admin/rooms";
              }}
              style={btnGhost}
            >
              再ログイン
            </button>
          ) : null}

          {msg ? (
            <span style={{ fontSize: 12, color: msgColor, fontWeight: 700 }}>
              {msg}
            </span>
          ) : null}
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
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
          進行中ルーム
        </h2>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 1600,
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>sessionId</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>classId</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>world/topic</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>クラス名</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>参加者</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>人数</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>status</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>created</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>updated</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>経過</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>通報</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>短時間退出</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>入退室頻度</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>危険度</th>
              </tr>
            </thead>

            <tbody>
              {rooms.map((room) => (
                <tr
                  key={room.session_id}
                  style={{
                    borderBottom: "1px solid #f3f3f3",
                    background: riskBg(room.risk_level),
                  }}
                >
                  <td
                    style={{
                      padding: "8px 6px",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: 11,
                    }}
                    title={room.session_id}
                  >
                    {shortId(room.session_id)}
                  </td>

                  <td
                    style={{
                      padding: "8px 6px",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: 11,
                    }}
                    title={room.class_id ?? undefined}
                  >
                    {room.class_id ? shortId(room.class_id) : "-"}
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    {room.world_key ?? "-"} / {room.topic_key ?? "-"}
                  </td>

                  <td style={{ padding: "8px 6px", fontWeight: 700 }}>
                    {room.class_name}
                  </td>

                  <td style={{ padding: "8px 6px", minWidth: 240 }}>
                    {room.members?.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {room.members.map((m) => (
                          <div
                            key={m.device_id}
                            style={{
                              padding: "6px 8px",
                              borderRadius: 10,
                              background: "#f6f6f6",
                              border: "1px solid #eee",
                            }}
                          >
                            <div style={{ fontWeight: 900 }}>
                              {m.display_name || "名無し"}
                            </div>

                            <div
                              style={{
                                marginTop: 2,
                                fontSize: 10,
                                color: "#666",
                                fontFamily:
                                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                              }}
                              title={m.device_id}
                            >
                              {shortId(m.device_id)}
                            </div>

                            <div style={{ marginTop: 2, fontSize: 10, color: "#888" }}>
                              入室: {fmtDateTime(m.joined_at)}
                            </div>

                            {room.class_id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setRepairClassId(room.class_id ?? "");
                                  setRepairSessionId(room.session_id);
                                  setRepairDeviceId(m.device_id);
                                }}
                                style={{
                                  marginTop: 6,
                                  padding: "4px 8px",
                                  borderRadius: 8,
                                  border: "1px solid #ccc",
                                  background: "#fff",
                                  fontSize: 10,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                修復対象にする
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "#999" }}>なし</span>
                    )}
                  </td>

                  <td style={{ padding: "8px 6px", minWidth: 140 }}>
                    {room.repair_summary ? (
                      <div style={{ lineHeight: 1.5 }}>
                        <div>
                          m: {room.repair_summary.class_memberships} / sm:{" "}
                          {room.repair_summary.session_members} / p:{" "}
                          {room.repair_summary.class_presence}
                        </div>
                        {room.repair_summary.members_missing_membership > 0 ? (
                          <div style={{ color: "#b45309", fontWeight: 800 }}>
                            membership欠落:{" "}
                            {room.repair_summary.members_missing_membership}
                          </div>
                        ) : null}
                        {room.repair_summary.possible_split_sessions > 1 ? (
                          <div style={{ color: "#92400e", fontWeight: 800 }}>
                            session分裂の可能性:{" "}
                            {room.repair_summary.possible_split_sessions}
                          </div>
                        ) : (
                          <div style={{ color: "#666" }}>分裂: なし</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "#999" }}>-</span>
                    )}
                  </td>

                  <td style={{ padding: "8px 6px" }}>{room.member_count}</td>
                  <td style={{ padding: "8px 6px" }}>{room.status}</td>
                  <td style={{ padding: "8px 6px" }}>
                    {fmtDateTime(room.created_at ?? room.started_at)}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    {fmtDateTime(room.updated_at ?? room.created_at ?? room.started_at)}
                  </td>
                  <td style={{ padding: "8px 6px" }}>{room.elapsed_minutes}分</td>
                  <td style={{ padding: "8px 6px" }}>{room.report_count}</td>
                  <td style={{ padding: "8px 6px" }}>{room.short_leave_count}</td>
                  <td style={{ padding: "8px 6px" }}>{room.join_leave_burst_count}</td>

                  <td style={{ padding: "8px 6px" }}>
                    <span style={{ fontWeight: 900, color: riskColor(room.risk_level) }}>
                      {room.risk_level} ({room.risk_score})
                    </span>
                  </td>
                </tr>
              ))}

              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ padding: 10, color: "#666" }}>
                    {emptyTableMessage}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <ClassRepairPanel
        key={`${repairClassId}:${repairSessionId}:${repairDeviceId}`}
        initialClassId={repairClassId}
        initialSessionId={repairSessionId}
        initialDeviceId={repairDeviceId}
      />

      <div style={{ height: 24 }} />
    </main>
  );
}