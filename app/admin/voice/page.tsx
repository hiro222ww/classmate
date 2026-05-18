"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type VoiceSettings = {
  voice_enabled: boolean;
  new_calls_enabled: boolean;
  turn_fallback_enabled: boolean;
  max_call_minutes: number;
  max_members_per_call: number;
  free_daily_minutes: number;
  paid_daily_minutes: number;
  emergency_message: string | null;
};

type HourlyMetric = {
  hour: string;
  total: number;
  turn: number;
  p2p: number;
  failed: number;
  unknown: number;
  turnRate: number;
  failRate: number;
  avgConnectMs: number;
};

type VoiceMetrics = {
  total: number;
  turn: number;
  p2p: number;
  unknown?: number;
  failed?: number;
  turnRate: number;
  failRate?: number;
  avgConnectMs?: number;
  hourly?: HourlyMetric[];
};

type VoiceLog = {
  id?: string;
  session_id?: string | null;
  device_id?: string | null;
  os?: string | null;
  member_count?: number | null;
  route?: string | null;
  used_turn?: boolean | null;
  connection_state?: string | null;
  time_to_connect_ms?: number | null;
  created_at?: string | null;
};

const defaultSettings: VoiceSettings = {
  voice_enabled: true,
  new_calls_enabled: true,
  turn_fallback_enabled: true,
  max_call_minutes: 30,
  max_members_per_call: 5,
  free_daily_minutes: 30,
  paid_daily_minutes: 120,
  emergency_message: "",
};

export default function AdminVoicePage() {
  const [settings, setSettings] = useState<VoiceSettings>(defaultSettings);
  const [metrics, setMetrics] = useState<VoiceMetrics | null>(null);
  const [logs, setLogs] = useState<VoiceLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/voice-settings", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (data?.settings) {
        setSettings({
          ...defaultSettings,
          ...data.settings,
          emergency_message: data.settings.emergency_message ?? "",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadMetrics() {
    setMetricsLoading(true);
    try {
      const res = await fetch("/api/admin/voice-metrics", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.metrics) {
        console.warn("[voice admin] metrics failed", data);
        setMetrics(null);
        return;
      }

      setMetrics(data.metrics);
    } finally {
      setMetricsLoading(false);
    }
  }

  async function loadLogs() {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/admin/voice-logs?limit=30", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        console.warn("[voice admin] logs failed", data);
        setLogs([]);
        return;
      }

      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } finally {
      setLogsLoading(false);
    }
  }

  async function save(next = settings) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/voice-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });

      const data = await res.json().catch(() => null);

      if (data?.settings) {
        setSettings({
          ...defaultSettings,
          ...data.settings,
          emergency_message: data.settings.emergency_message ?? "",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof VoiceSettings>(
    key: K,
    value: VoiceSettings[K]
  ) {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  useEffect(() => {
    void load();
    void loadMetrics();
    void loadLogs();

    const channel = supabase
      .channel("voice_logs")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "voice_connection_logs",
        },
        () => {
          void loadMetrics();
          void loadLogs();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "#f8fafc",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <button type="button" onClick={() => (window.location.href = "/admin")} style={smallButtonStyle}>
            管理トップへ
          </button>
        </div>

        <h1 style={{ fontSize: 28, marginBottom: 8 }}>通話管理</h1>
        <p style={{ color: "#6b7280", marginBottom: 24 }}>
          TURN課金・通話上限・緊急停止を管理します。
        </p>

        <section style={cardStyle}>
          <h2 style={sectionTitle}>接続統計（今日）</h2>

          {metricsLoading ? (
            <div style={{ color: "#6b7280", fontWeight: 800 }}>読み込み中...</div>
          ) : metrics ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              <MetricCard label="TURN使用率" value={`${metrics.turnRate}%`} />
              <MetricCard label="TURN接続" value={`${metrics.turn}`} />
              <MetricCard label="P2P接続" value={`${metrics.p2p}`} />
              <MetricCard label="総接続ログ" value={`${metrics.total}`} />
              <MetricCard label="不明" value={`${metrics.unknown ?? 0}`} />
              <MetricCard label="失敗/切断" value={`${metrics.failed ?? 0}`} />
              <MetricCard label="失敗率" value={`${metrics.failRate ?? 0}%`} />
              <MetricCard label="平均接続時間" value={`${metrics.avgConnectMs ?? 0}ms`} />
            </div>
          ) : (
            <div style={{ color: "#6b7280", fontWeight: 800 }}>
              統計はまだありません。
            </div>
          )}

          {metrics?.hourly && metrics.hourly.length > 0 && (
            <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>時間別接続状況</div>

              {metrics.hourly.map((h) => (
                <div
                  key={h.hour}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 10,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      marginBottom: 6,
                    }}
                  >
                    <strong>{h.hour}</strong>
                    <span>
                      TURN {h.turnRate}% / FAIL {h.failRate}%
                    </span>
                  </div>

                  <div
                    style={{
                      height: 12,
                      borderRadius: 999,
                      overflow: "hidden",
                      display: "flex",
                      background: "#e5e7eb",
                    }}
                  >
                    <div style={{ width: `${h.turnRate}%`, background: "#f59e0b" }} />
                    <div style={{ width: `${h.failRate}%`, background: "#dc2626" }} />
                    <div style={{ flex: 1, background: "#16a34a" }} />
                  </div>

                  <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                    total: {h.total} / p2p: {h.p2p} / turn: {h.turn} / avg:{" "}
                    {h.avgConnectMs}ms
                  </div>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={() => void loadMetrics()} style={smallButtonStyle}>
            統計を再読み込み
          </button>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitle}>直近の接続ログ</h2>

          {logsLoading ? (
            <div style={{ color: "#6b7280", fontWeight: 800 }}>読み込み中...</div>
          ) : logs.length === 0 ? (
            <div style={{ color: "#6b7280", fontWeight: 800 }}>
              接続ログはまだありません。
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {logs.map((log, i) => {
                const route = String(log.route ?? "unknown");
                const state = String(log.connection_state ?? "unknown");
                const usedTurn =
                  log.used_turn === true || route === "relay" || route === "turn";

                return (
                  <div
                    key={log.id ?? `${log.created_at}-${i}`}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 12,
                      background: "#f9fafb",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>
                      {usedTurn ? "TURN" : "P2P/不明"} / {state}
                    </div>

                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      OS: {log.os ?? "unknown"} / 人数: {log.member_count ?? "-"} / route: {route}
                    </div>

                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      接続時間: {log.time_to_connect_ms ?? "-"}ms /{" "}
                      {log.created_at ? new Date(log.created_at).toLocaleString() : ""}
                    </div>

                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      session: {log.session_id ?? "-"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button type="button" onClick={() => void loadLogs()} style={smallButtonStyle}>
            ログを再読み込み
          </button>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitle}>緊急操作</h2>

          <div style={rowStyle}>
            <span>通話機能</span>
            <Toggle checked={settings.voice_enabled} onChange={(v) => update("voice_enabled", v)} />
          </div>

          <div style={rowStyle}>
            <span>新規通話</span>
            <Toggle checked={settings.new_calls_enabled} onChange={(v) => update("new_calls_enabled", v)} />
          </div>

          <div style={rowStyle}>
            <span>TURN fallback</span>
            <Toggle checked={settings.turn_fallback_enabled} onChange={(v) => update("turn_fallback_enabled", v)} />
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button
              type="button"
              onClick={() => {
                const next = {
                  ...settings,
                  voice_enabled: false,
                  new_calls_enabled: false,
                  turn_fallback_enabled: false,
                  emergency_message: "現在、通話機能を一時停止しています。",
                };
                setSettings(next);
                void save(next);
              }}
              style={dangerButtonStyle}
            >
              🚨 全通話停止
            </button>

            <button
              type="button"
              onClick={() => {
                const next = {
                  ...settings,
                  turn_fallback_enabled: false,
                  emergency_message: "現在、安定接続モードを一時停止しています。",
                };
                setSettings(next);
                void save(next);
              }}
              style={warningButtonStyle}
            >
              TURNだけ停止
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitle}>通話制限</h2>

          <NumberField label="1セッション最大分数" value={settings.max_call_minutes} onChange={(v) => update("max_call_minutes", v)} />
          <NumberField label="最大人数" value={settings.max_members_per_call} onChange={(v) => update("max_members_per_call", v)} />
          <NumberField label="無料ユーザー 1日上限分数" value={settings.free_daily_minutes} onChange={(v) => update("free_daily_minutes", v)} />
          <NumberField label="有料ユーザー 1日上限分数" value={settings.paid_daily_minutes} onChange={(v) => update("paid_daily_minutes", v)} />

          <label style={{ display: "block", marginTop: 16 }}>
            <div style={{ marginBottom: 6, fontWeight: 700 }}>緊急メッセージ</div>
            <textarea
              value={settings.emergency_message ?? ""}
              onChange={(e) => update("emergency_message", e.target.value)}
              rows={3}
              style={textareaStyle}
              placeholder="例：現在、通話機能を一時停止しています。"
            />
          </label>
        </section>

        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          style={saveButtonStyle}
        >
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#f9fafb" }}>
      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        padding: "8px 14px",
        borderRadius: 999,
        border: "1px solid #d1d5db",
        background: checked ? "#16a34a" : "#e5e7eb",
        color: checked ? "#fff" : "#374151",
        fontWeight: 800,
        cursor: "pointer",
        minWidth: 72,
      }}
    >
      {checked ? "ON" : "OFF"}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={numberRowStyle}>
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={inputStyle}
      />
    </label>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 20,
  marginBottom: 18,
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  marginBottom: 16,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 0",
  borderBottom: "1px solid #f3f4f6",
  fontWeight: 700,
};

const numberRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "10px 0",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: 120,
  padding: "9px 10px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  resize: "vertical",
};

const saveButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 999,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 999,
  border: "none",
  background: "#dc2626",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const warningButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 999,
  border: "none",
  background: "#f59e0b",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  marginTop: 14,
  padding: "9px 12px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  fontWeight: 900,
  cursor: "pointer",
};