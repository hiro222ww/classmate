"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_OPS_TEST_FLAGS,
  type OpsTestFlags,
  anyOpsTestFlagEnabled,
  normalizeOpsTestFlags,
} from "@/lib/opsTestModeShared";

const TOGGLES: Array<{
  key: keyof OpsTestFlags;
  label: string;
  help: string;
}> = [
  {
    key: "ignoreAdmission",
    label: "受付時間を無視",
    help: "入校受付時間外でも、管理者本人だけ通常フローで新規入室できます。",
  },
  {
    key: "ignoreAge",
    label: "年齢条件を無視",
    help: "管理者本人の入室・テーマ・マッチング年齢判定だけを例外にします。一般ユーザー側の年齢フィルターや minors_enabled は変更しません。",
  },
  {
    key: "allowMinorProfile",
    label: "未成年プロフィールを許可",
    help: "管理者本人のプロフィール保存時の年齢制限だけを例外にします。入室/マッチングの年齢条件とは独立です。",
  },
  {
    key: "ignoreRecruitment",
    label: "募集時間を無視",
    help: "募集締切・待機TTL・accepting_new_users など募集受付の時間制限だけを例外にします。終了済み/破棄済みセッションへの参加は拒否したままです。",
  },
];

export function OpsTestModePanel() {
  const [flags, setFlags] = useState<OpsTestFlags>({ ...DEFAULT_OPS_TEST_FLAGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ops-test-mode", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "load_failed");
      }
      setFlags(normalizeOpsTestFlags(json.flags));
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: OpsTestFlags) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ops-test-mode", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flags: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "save_failed");
      }
      setFlags(normalizeOpsTestFlags(json.flags));
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "save_failed");
      await load();
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof OpsTestFlags) {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    void save(next);
  }

  const active = anyOpsTestFlagEnabled(flags);

  return (
    <section
      style={{
        marginBottom: 18,
        padding: 18,
        borderRadius: 18,
        border: active ? "1px solid #fbbf24" : "1px solid #e5e7eb",
        background: active ? "#fffbeb" : "#fff",
        boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
            運営テストモード
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "#667085",
              lineHeight: 1.5,
              maxWidth: 560,
            }}
          >
            認証済み管理者本人のリクエストだけに例外を適用します。サービス全体の設定（受付時間・minors_enabled
            など）は書き換えません。固定デモは{" "}
            <a href="/call/demo" style={{ color: "#2563eb", fontWeight: 700 }}>
              /call/demo
            </a>
            を使ってください。
          </p>
        </div>
        {active ? (
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              color: "#92400e",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            運営テスト中
          </span>
        ) : null}
      </div>

      {loading ? (
        <p style={{ marginTop: 14, fontSize: 13, color: "#667085" }}>読み込み中…</p>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {TOGGLES.map((item) => (
            <label
              key={item.key}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "6px 10px",
                alignItems: "start",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: saving ? "wait" : "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={flags[item.key]}
                disabled={saving}
                onChange={() => toggle(item.key)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ fontWeight: 800, fontSize: 14, color: "#111827" }}>
                  {item.label}
                </span>
                <span
                  style={{
                    display: "block",
                    marginTop: 4,
                    fontSize: 12,
                    color: "#667085",
                    lineHeight: 1.45,
                  }}
                >
                  {item.help}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      {error ? (
        <p style={{ marginTop: 10, color: "#dc2626", fontSize: 13, fontWeight: 700 }}>
          {error}
        </p>
      ) : null}
      {savedAt ? (
        <p style={{ marginTop: 10, color: "#667085", fontSize: 12 }}>
          保存済み（{savedAt}）
        </p>
      ) : null}
    </section>
  );
}
