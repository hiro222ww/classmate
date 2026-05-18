"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

type ReportRow = {
  id: string;
  created_at: string;
  reporter_device_id: string;
  target_device_id: string | null;
  session_id: string | null;
  class_id: string | null;
  reason: string;
  detail: string | null;
  status: string;
  admin_note: string | null;
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
  }).format(d);
}

function shortId(id: string | null) {
  if (!id) return "-";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

async function readJsonOrThrow(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ?? "request_failed");
  }
  return data;
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadReports(nextStatus = status) {
    setBusy(true);
    setMsg("");

    try {
      const res = await fetch(
        `/api/admin/reports?status=${encodeURIComponent(nextStatus)}&limit=100`,
        { cache: "no-store" }
      );

      const data = await readJsonOrThrow(res);
      setReports(data.reports ?? []);
      setMsg(`読み込みOK（${(data.reports ?? []).length}件）`);
    } catch (e: any) {
      setMsg(e?.message ?? "load_failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateReport(
    report: ReportRow,
    nextStatus: "open" | "reviewing" | "resolved" | "dismissed"
  ) {
    const note =
      window.prompt("管理メモ（任意）", report.admin_note ?? "") ?? report.admin_note;

    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: report.id,
          status: nextStatus,
          adminNote: note,
        }),
      });

      await readJsonOrThrow(res);
      setMsg("更新OK");
      await loadReports();
    } catch (e: any) {
      setMsg(e?.message ?? "update_failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadReports("open");
  }, []);

  const card: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 14,
    background: "#fff",
  };

  const btn: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 999,
    border: "1px solid #d1d5db",
    background: "#111827",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  };

  const ghostBtn: React.CSSProperties = {
    ...btn,
    background: "#fff",
    color: "#111827",
  };

  const dangerBtn: React.CSSProperties = {
    ...btn,
    background: "#fff",
    color: "#b00020",
    borderColor: "#f2b7c0",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 20,
        background: "#f8fafc",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => (window.location.href = "/admin")}
            style={ghostBtn}
          >
            管理トップへ
          </button>
        </div>

        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>
          通報管理
        </h1>

        <p style={{ marginTop: 8, color: "#667085", fontSize: 13 }}>
          ユーザーからの通報を確認し、対応状況を管理します。
        </p>

        <section style={{ ...card, marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={status}
              onChange={(e) => {
                const v = e.target.value;
                setStatus(v);
                void loadReports(v);
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "#fff",
              }}
            >
              <option value="open">未対応</option>
              <option value="reviewing">確認中</option>
              <option value="resolved">対応済み</option>
              <option value="dismissed">対応不要</option>
              <option value="all">すべて</option>
            </select>

            <button
              type="button"
              onClick={() => void loadReports()}
              disabled={busy}
              style={{ ...btn, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "読み込み中…" : "再読み込み"}
            </button>

            {msg ? <span style={{ fontSize: 12, color: "#374151" }}>{msg}</span> : null}
          </div>
        </section>

        <section style={{ ...card, marginTop: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
            通報一覧
          </h2>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {reports.map((r) => (
              <div
                key={r.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 14,
                  background: r.status === "open" ? "#fff7ed" : "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900 }}>
                      {r.reason}
                    </div>

                    <div style={{ marginTop: 4, fontSize: 12, color: "#667085" }}>
                      {fmtDateTime(r.created_at)} / status: {r.status}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => updateReport(r, "reviewing")}
                      style={ghostBtn}
                    >
                      確認中
                    </button>

                    <button
                      type="button"
                      onClick={() => updateReport(r, "resolved")}
                      style={btn}
                    >
                      対応済み
                    </button>

                    <button
                      type="button"
                      onClick={() => updateReport(r, "dismissed")}
                      style={dangerBtn}
                    >
                      対応不要
                    </button>
                  </div>
                </div>

                {r.detail ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 12,
                      background: "#f9fafb",
                      fontSize: 13,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {r.detail}
                  </div>
                ) : null}

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 8,
                    fontSize: 12,
                    color: "#475467",
                  }}
                >
                  <div>
                    通報者:{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {shortId(r.reporter_device_id)}
                    </span>
                  </div>

                  <div>
                    対象:{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {shortId(r.target_device_id)}
                    </span>
                  </div>

                  <div>
                    session:{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {shortId(r.session_id)}
                    </span>
                  </div>

                  <div>
                    class:{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {shortId(r.class_id)}
                    </span>
                  </div>
                </div>

                {r.admin_note ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 12,
                      background: "#eef2ff",
                      fontSize: 12,
                    }}
                  >
                    管理メモ: {r.admin_note}
                  </div>
                ) : null}
              </div>
            ))}

            {reports.length === 0 ? (
              <div style={{ color: "#667085", fontWeight: 800 }}>
                通報はありません。
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}