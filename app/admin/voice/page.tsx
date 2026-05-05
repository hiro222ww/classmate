"use client";

import { useEffect, useState } from "react";

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

type VoiceMetrics = {
  total: number;
  turn: number;
  p2p: number;
  unknown?: number;
  turnRate: number;
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
  const [authorized, setAuthorized] = useState(false);
const [settings, setSettings] = useState<VoiceSettings>(defaultSettings);
const [metrics, setMetrics] = useState<VoiceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/voice-settings", {
        cache: "no-store",
      });
      const data = await res.json();

      if (data.settings) {
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
      const data = await res.json();

      if (data.metrics) {
        setMetrics(data.metrics);
      }
    } finally {
      setMetricsLoading(false);
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

      const data = await res.json();

      if (data.settings) {
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

  function update<K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  useEffect(() => {
  const saved = localStorage.getItem("admin_pass");

if (saved === "好きな長いパスワード") {
  setAuthorized(true);
  return;
}

const pass = window.prompt("管理者パスワード");

if (pass === "好きな長いパスワード") {
  localStorage.setItem("admin_pass", pass);
  setAuthorized(true);
  return;
}

  window.location.href = "/";
}, []);

useEffect(() => {
  if (!authorized) return;

  void load();
  void loadMetrics();
}, [authorized]);

if (!authorized) {
  return (
    <main style={{ padding: 24 }}>
      <p>認証中...</p>
    </main>
  );
}

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
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>通話管理</h1>
        <p style={{ color: "#6b7280", marginBottom: 24 }}>
          TURN課金・通話上限・緊急停止を管理します。
        </p>

        <section style={cardStyle}>
          <h2 style={sectionTitle}>接続統計（今日）</h2>

          {metricsLoading ? (
            <div style={{ color: "#6b7280", fontWeight: 800 }}>
              読み込み中...
            </div>
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
            </div>
          ) : (
            <div style={{ color: "#6b7280", fontWeight: 800 }}>
              統計はまだありません。
            </div>
          )}

          <button
            type="button"
            onClick={() => void loadMetrics()}
            style={smallButtonStyle}
          >
            統計を再読み込み
          </button>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitle}>緊急操作</h2>

          <div style={rowStyle}>
            <span>通話機能</span>
            <Toggle
              checked={settings.voice_enabled}
              onChange={(v) => update("voice_enabled", v)}
            />
          </div>

          <div style={rowStyle}>
            <span>新規通話</span>
            <Toggle
              checked={settings.new_calls_enabled}
              onChange={(v) => update("new_calls_enabled", v)}
            />
          </div>

          <div style={rowStyle}>
            <span>TURN fallback</span>
            <Toggle
              checked={settings.turn_fallback_enabled}
              onChange={(v) => update("turn_fallback_enabled", v)}
            />
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
                  emergency_message:
                    "現在、通話機能を一時停止しています。",
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
                  emergency_message:
                    "現在、安定接続モードを一時停止しています。",
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

          <NumberField
            label="1セッション最大分数"
            value={settings.max_call_minutes}
            onChange={(v) => update("max_call_minutes", v)}
          />

          <NumberField
            label="最大人数"
            value={settings.max_members_per_call}
            onChange={(v) => update("max_members_per_call", v)}
          />

          <NumberField
            label="無料ユーザー 1日上限分数"
            value={settings.free_daily_minutes}
            onChange={(v) => update("free_daily_minutes", v)}
          />

          <NumberField
            label="有料ユーザー 1日上限分数"
            value={settings.paid_daily_minutes}
            onChange={(v) => update("paid_daily_minutes", v)}
          />

          <label style={{ display: "block", marginTop: 16 }}>
            <div style={{ marginBottom: 6, fontWeight: 700 }}>
              緊急メッセージ
            </div>
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
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 14,
        background: "#f9fafb",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
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