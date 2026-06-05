"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { HelpTip } from "@/components/HelpTip";
import {
  DEFAULT_P2P_ENABLED,
  describeVoiceTransportMode,
  parseExplicitBoolean,
} from "@/lib/voiceTransportMode";

type VoiceSettings = {
  voice_enabled: boolean;
  new_calls_enabled: boolean;
  p2p_enabled: boolean;
  turn_fallback_enabled: boolean;
  max_members_per_call: number;
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

function parseVoiceFailureState(state: string | null | undefined): {
  voiceClass: string | null;
  offer: string | null;
  answer: string | null;
  ice: string | null;
  audio: string | null;
  closeReason: string | null;
  remotes: string | null;
} {
  const raw = String(state ?? "").trim();
  if (!raw.startsWith("failed:class=")) {
    return {
      voiceClass: null,
      offer: null,
      answer: null,
      ice: null,
      audio: null,
      closeReason: null,
      remotes: null,
    };
  }
  const parts = raw.split("|");
  const read = (key: string) => {
    const part = parts.find((p) => p.startsWith(`${key}=`));
    return part ? part.slice(key.length + 1) : null;
  };
  const classPart = parts[0] ?? "";
  const voiceClass = classPart.replace("failed:class=", "") || null;
  return {
    voiceClass,
    offer: read("offer"),
    answer: read("answer"),
    ice: read("ice"),
    audio: read("audio"),
    closeReason: read("close"),
    remotes: read("remotes"),
  };
}

type VoiceLog = {
  id?: string;
  session_id?: string | null;
  device_id?: string | null;
  os?: string | null;
  member_count?: number | null;
  route?: string | null;
  used_turn?: boolean | null;
  voice_route?: string | null;
  connection_state?: string | null;
  time_to_connect_ms?: number | null;
  created_at?: string | null;
};

const defaultSettings: VoiceSettings = {
  voice_enabled: true,
  new_calls_enabled: true,
  p2p_enabled: DEFAULT_P2P_ENABLED,
  turn_fallback_enabled: false,
  max_members_per_call: 5,
  emergency_message: "",
};

function isAdminVoiceDebug() {
  if (typeof window === "undefined") return false;
  try {
    return (
      process.env.NEXT_PUBLIC_DEBUG_VOICE === "true" ||
      new URLSearchParams(window.location.search).get("debugVoice") === "1" ||
      localStorage.getItem("debugVoice") === "1"
    );
  } catch {
    return false;
  }
}

function adminVoiceDebugLog(event: string, extra: Record<string, unknown> = {}) {
  if (!isAdminVoiceDebug()) return;
  const suffix = Object.entries(extra)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  console.log(`[admin-voice-settings] ${event}${suffix ? ` ${suffix}` : ""}`);
}

function normalizeAdminVoiceSettings(
  raw: Partial<VoiceSettings> | null | undefined
): VoiceSettings {
  if (!raw) return { ...defaultSettings };

  return {
    voice_enabled: raw.voice_enabled !== false,
    new_calls_enabled: raw.new_calls_enabled !== false,
    p2p_enabled: parseExplicitBoolean(
      raw.p2p_enabled,
      DEFAULT_P2P_ENABLED
    ),
    turn_fallback_enabled: raw.turn_fallback_enabled === true,
    max_members_per_call: Number(
      raw.max_members_per_call ?? defaultSettings.max_members_per_call
    ),
    emergency_message: raw.emergency_message ?? "",
  };
}

function transportModeLabel(p2p: boolean, staticTurn: boolean) {
  switch (describeVoiceTransportMode(p2p, staticTurn)) {
    case "p2p_with_static_fallback":
      return "P2P優先 + 自前TURN fallback";
    case "p2p_only":
      return "P2Pのみ";
    case "relay_only":
      return "自前TURNのみ（検証用）";
    default:
      return "通話不可（P2P/TURN 両方OFF）";
  }
}

export default function AdminVoicePage() {
  const [settings, setSettings] =
    useState<VoiceSettings>(defaultSettings);

  const [metrics, setMetrics] =
    useState<VoiceMetrics | null>(null);

  const [logs, setLogs] = useState<VoiceLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] =
    useState(true);

  const [logsLoading, setLogsLoading] =
    useState(true);

  const [saving, setSaving] = useState(false);

  const loadSeqRef = useRef(0);
  const saveSeqRef = useRef(0);

  function shouldIgnoreSettingsFetch(seq: number) {
    return seq < loadSeqRef.current || seq <= saveSeqRef.current;
  }

  async function load() {
    const seq = ++loadSeqRef.current;
    setLoading(true);

    try {
      const res = await fetch(
        "/api/admin/voice-settings",
        {
          cache: "no-store",
        }
      );

      const data = await res.json().catch(() => null);

      if (shouldIgnoreSettingsFetch(seq)) {
        adminVoiceDebugLog("refetch ignored stale", {
          seq,
          loadSeq: loadSeqRef.current,
          saveSeq: saveSeqRef.current,
        });
        return;
      }

      if (data?.settings) {
        const normalized = normalizeAdminVoiceSettings(data.settings);
        adminVoiceDebugLog("refetch", {
          p2p_enabled: normalized.p2p_enabled,
          source: "db",
        });
        setSettings(normalized);
      } else if (typeof data?.p2p_enabled === "boolean") {
        setSettings((prev) => ({
          ...prev,
          p2p_enabled: data.p2p_enabled,
        }));
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }

  async function loadMetrics() {
    setMetricsLoading(true);

    try {
      const res = await fetch(
        "/api/admin/voice-metrics",
        {
          cache: "no-store",
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.metrics) {
        console.warn(
          "[voice admin] metrics failed",
          data
        );

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
      const res = await fetch(
        "/api/admin/voice-logs?limit=30",
        {
          cache: "no-store",
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        console.warn(
          "[voice admin] logs failed",
          data
        );

        setLogs([]);
        return;
      }

      setLogs(
        Array.isArray(data.logs)
          ? data.logs
          : []
      );
    } finally {
      setLogsLoading(false);
    }
  }

  async function save(next = settings) {
    const seq = ++saveSeqRef.current;
    loadSeqRef.current = seq;
    adminVoiceDebugLog("save-request", { p2p_enabled: next.p2p_enabled });
    setSaving(true);

    try {
      const res = await fetch(
        "/api/admin/voice-settings",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(next),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        adminVoiceDebugLog("save-failed", {
          p2p_enabled: next.p2p_enabled,
          status: res.status,
        });
        return;
      }

      if (data?.settings) {
        const normalized = normalizeAdminVoiceSettings(data.settings);
        adminVoiceDebugLog("save-response", {
          p2p_enabled: normalized.p2p_enabled,
        });
        setSettings(normalized);
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
      <div
        style={{
          maxWidth: 860,
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() =>
              (window.location.href = "/admin")
            }
            style={smallButtonStyle}
          >
            管理トップへ
          </button>
        </div>

        <h1
          style={{
            fontSize: 28,
            marginBottom: 8,
          }}
        >
          通話管理
        </h1>

        <p
          style={{
            color: "#6b7280",
            marginBottom: 24,
          }}
        >
          音声の接続方式（P2P / 自前TURN）と緊急停止を管理します。
        </p>

        <div
          style={{
            marginBottom: 24,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 800, color: "#374151" }}>
            現在の接続モード:
          </span>
          <span
            style={{
              display: "inline-flex",
              padding: "4px 10px",
              borderRadius: 999,
              background:
                !settings.p2p_enabled && !settings.turn_fallback_enabled
                  ? "#fee2e2"
                  : !settings.p2p_enabled
                    ? "#dbeafe"
                    : "#ecfdf5",
              color:
                !settings.p2p_enabled && !settings.turn_fallback_enabled
                  ? "#b91c1c"
                  : !settings.p2p_enabled
                    ? "#1d4ed8"
                    : "#047857",
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            {transportModeLabel(
              settings.p2p_enabled,
              settings.turn_fallback_enabled
            )}
          </span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            P2P: {settings.p2p_enabled ? "ON" : "OFF"} · 自前TURN:{" "}
            {settings.turn_fallback_enabled ? "ON" : "OFF"}
          </span>
          {!settings.p2p_enabled && !settings.turn_fallback_enabled ? (
            <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 800 }}>
              P2Pと自前TURNが両方OFFのため、音声通話は開始できません
            </span>
          ) : null}
        </div>

        {/* 接続統計 */}

        <section style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ ...sectionTitle, margin: 0 }}>接続統計（今日）</h2>
            <HelpTip
              label="失敗率の見方"
              content="失敗率は接続リトライごとの failed ログを含みます。のちに connected になった peer の過去 failed も残るため、実態より高く見えることがあります。route=unknown かつ connected は失敗扱いではありません。"
            />
          </div>

          {metricsLoading ? (
            <div
              style={{
                color: "#6b7280",
                fontWeight: 800,
              }}
            >
              読み込み中...
            </div>
          ) : metrics ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              <MetricCard
                label="TURN使用率"
                value={`${metrics.turnRate}%`}
              />

              <MetricCard
                label="TURN接続"
                value={`${metrics.turn}`}
              />

              <MetricCard
                label="P2P接続"
                value={`${metrics.p2p}`}
              />

              <MetricCard
                label="総接続ログ"
                value={`${metrics.total}`}
              />

              <MetricCard
                label="不明"
                value={`${metrics.unknown ?? 0}`}
              />

              <MetricCard
                label="失敗/切断"
                value={`${metrics.failed ?? 0}`}
              />

              <MetricCard
                label="失敗率"
                value={`${metrics.failRate ?? 0}%`}
              />

              <MetricCard
                label="平均接続時間"
                value={`${metrics.avgConnectMs ?? 0}ms`}
              />
            </div>
          ) : (
            <div
              style={{
                color: "#6b7280",
                fontWeight: 800,
              }}
            >
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

        {/* 接続ログ */}

        <section style={cardStyle}>
          <h2 style={sectionTitle}>
            直近の接続ログ
          </h2>

          {logsLoading ? (
            <div
              style={{
                color: "#6b7280",
                fontWeight: 800,
              }}
            >
              読み込み中...
            </div>
          ) : logs.length === 0 ? (
            <div
              style={{
                color: "#6b7280",
                fontWeight: 800,
              }}
            >
              接続ログはまだありません。
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 8,
              }}
            >
              {logs.map((log, i) => {
                const route = String(
                  log.route ?? "unknown"
                );

                const state = String(
                  log.connection_state ?? "unknown"
                );
                const failure = parseVoiceFailureState(state);
                const voiceRoute = String(log.voice_route ?? "").trim();
                const failClass =
                  failure.voiceClass ??
                  (voiceRoute.startsWith("fail-")
                    ? voiceRoute.replace("fail-", "")
                    : null);

                const usedTurn =
                  log.used_turn === true ||
                  route === "relay" ||
                  route === "turn";

                return (
                  <div
                    key={
                      log.id ??
                      `${log.created_at}-${i}`
                    }
                    style={{
                      border:
                        "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 12,
                      background: "#f9fafb",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                      }}
                    >
                      {usedTurn
                        ? "TURN"
                        : "P2P/不明"}{" "}
                      / {state}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      OS: {log.os ?? "unknown"} /
                      人数:{" "}
                      {log.member_count ?? "-"} /
                      route: {route}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      接続時間:{" "}
                      {log.time_to_connect_ms ??
                        "-"}
                      ms /
                      {log.created_at
                        ? new Date(
                            log.created_at
                          ).toLocaleString()
                        : ""}
                    </div>

                    {failClass ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#991b1b",
                          fontWeight: 800,
                        }}
                      >
                        失敗分類: {failClass}（A=members B=signaling C=ICE
                        D=audio E=cleanup）
                      </div>
                    ) : null}

                    {failure.offer != null ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        offer={failure.offer} answer={failure.answer} ice=
                        {failure.ice} audio={failure.audio} close=
                        {failure.closeReason ?? "-"} remotes=
                        {failure.remotes ?? "-"}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => void loadLogs()}
            style={smallButtonStyle}
          >
            ログを再読み込み
          </button>
        </section>

        {/* 緊急操作 */}

        <section style={cardStyle}>
          <h2 style={sectionTitle}>
            緊急操作
          </h2>

          <div style={rowStyle}>
            <span>通話機能</span>

            <Toggle
              checked={settings.voice_enabled}
              onChange={(v) =>
                update("voice_enabled", v)
              }
            />
          </div>

          <div style={rowStyle}>
            <span>新規通話</span>

            <Toggle
              checked={
                settings.new_calls_enabled
              }
              onChange={(v) =>
                update(
                  "new_calls_enabled",
                  v
                )
              }
            />
          </div>

          <div style={rowStyle}>
            <HelpTip
              label="P2P"
              content="ONのときは端末同士の直接接続を優先します。通常はON推奨です。"
            >
              <div style={{ fontWeight: 800 }}>P2P</div>
            </HelpTip>

            <Toggle
              checked={settings.p2p_enabled}
              onChange={(v) => update("p2p_enabled", v)}
            />
          </div>

          <div style={rowStyle}>
            <HelpTip
              label="自前TURN"
              content="P2P接続に失敗した相手だけ、自前のTURNサーバーで中継します。P2PをOFFにした場合は最初からTURNを使います。"
            >
              <div style={{ fontWeight: 800 }}>自前TURN</div>
            </HelpTip>

            <Toggle
              checked={settings.turn_fallback_enabled}
              onChange={(v) => update("turn_fallback_enabled", v)}
            />
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "#6b7280",
              lineHeight: 1.6,
            }}
          >
            保存後:{" "}
            <strong>
              {transportModeLabel(
                settings.p2p_enabled,
                settings.turn_fallback_enabled
              )}
            </strong>
          </div>
          {!settings.p2p_enabled && !settings.turn_fallback_enabled ? (
            <p
              style={{
                marginTop: 12,
                fontSize: 13,
                color: "#b91c1c",
                fontWeight: 700,
                lineHeight: 1.5,
              }}
            >
              P2Pと自前TURNが両方OFFのため、音声通話は開始できません
            </p>
          ) : null}
        </section>

        {/* 通話設定 */}

        <section style={cardStyle}>
          <h2 style={sectionTitle}>
            通話設定
          </h2>

          <NumberField
            label="最大人数"
            value={
              settings.max_members_per_call
            }
            onChange={(v) =>
              update(
                "max_members_per_call",
                v
              )
            }
          />

          <label
            style={{
              display: "block",
              marginTop: 16,
            }}
          >
            <div
              style={{
                marginBottom: 6,
                fontWeight: 700,
              }}
            >
              緊急メッセージ
            </div>

            <textarea
              value={
                settings.emergency_message ??
                ""
              }
              onChange={(e) =>
                update(
                  "emergency_message",
                  e.target.value
                )
              }
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
          {saving
            ? "保存中..."
            : "保存する"}
        </button>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 14,
        background: "#f9fafb",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "#6b7280",
          fontWeight: 800,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 24,
          fontWeight: 900,
        }}
      >
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
        background: checked
          ? "#16a34a"
          : "#e5e7eb",
        color: checked
          ? "#fff"
          : "#374151",
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
        onChange={(e) =>
          onChange(Number(e.target.value))
        }
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
  boxShadow:
    "0 8px 24px rgba(15,23,42,0.06)",
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