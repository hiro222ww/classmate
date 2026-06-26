"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  adminBtn,
  adminBtnGhost,
  adminCard,
  adminInput,
  adminPageInner,
  adminPageMain,
  readJsonOrThrow,
} from "@/app/admin/adminUi";

type RecruitmentTtlMode = "5" | "10" | "15" | "unlimited";

export default function AdminSettingsPage() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [globalJoinEnabled, setGlobalJoinEnabled] = useState(false);
  const [globalJoinStart, setGlobalJoinStart] = useState("21:00");
  const [globalJoinEnd, setGlobalJoinEnd] = useState("21:30");
  const [recruitmentTtlMode, setRecruitmentTtlMode] =
    useState<RecruitmentTtlMode>("5");
  const [minorsEnabled, setMinorsEnabled] = useState(false);
  const [minorsRiskAck, setMinorsRiskAck] = useState(false);
  const [productionAgeLocked, setProductionAgeLocked] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const sj = await readJsonOrThrow(res);
      const settings = sj.settings ?? {};

      setGlobalJoinEnabled(Boolean(settings.global_join_window?.enabled));
      setGlobalJoinStart(String(settings.global_join_window?.start ?? "21:00"));
      setGlobalJoinEnd(String(settings.global_join_window?.end ?? "21:30"));

      const ttl = settings.recruitment_session_ttl_minutes ?? {};
      if (ttl.unlimited === true) {
        setRecruitmentTtlMode("unlimited");
      } else if (Number(ttl.minutes) === 10) {
        setRecruitmentTtlMode("10");
      } else if (Number(ttl.minutes) === 15) {
        setRecruitmentTtlMode("15");
      } else {
        setRecruitmentTtlMode("5");
      }

      setMinorsEnabled(settings.minors_enabled === true);
      setProductionAgeLocked(Boolean(sj.production_age_locked));
      setMsg("読み込みOK");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setMsg("");
    setBusy(true);

    try {
      if (minorsEnabled && !minorsRiskAck) {
        setMsg(
          "未成年許可を有効にする前に、下の確認チェックリストにチェックを入れてください。"
        );
        setBusy(false);
        return;
      }

      const res = await fetch("/api/admin/settings", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          global_join_window: {
            enabled: globalJoinEnabled,
            start: globalJoinStart,
            end: globalJoinEnd,
          },
          recruitment_session_ttl_minutes:
            recruitmentTtlMode === "unlimited"
              ? { unlimited: true, minutes: null }
              : { unlimited: false, minutes: Number(recruitmentTtlMode) },
          minors_enabled: minorsEnabled,
        }),
      });

      await readJsonOrThrow(res);
      setMsg("設定を保存しました");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "settings_save_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={adminPageMain}>
      <div style={adminPageInner}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>運用設定</h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#667085" }}>
            入校受付時間・募集締切・未成年登録を管理します。
          </p>
        </header>

        <section style={adminCard}>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => void loadSettings()}
              disabled={busy}
              style={{ ...adminBtn, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "処理中…" : "読み込み"}
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/admin";
              }}
              style={adminBtnGhost}
            >
              管理トップへ
            </button>
            {msg ? <span style={{ fontSize: 12, color: "#333" }}>{msg}</span> : null}
          </div>
        </section>

        <section style={{ ...adminCard, marginTop: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>入校受付時間</h2>

          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <label
              style={{
                fontSize: 13,
                display: "flex",
                gap: 8,
                alignItems: "center",
                gridColumn: "1 / -1",
              }}
            >
              <input
                type="checkbox"
                checked={globalJoinEnabled}
                onChange={(e) => setGlobalJoinEnabled(e.target.checked)}
              />
              入校受付時間を有効にする
            </label>

            <label style={{ fontSize: 12, color: "#666" }}>
              受付開始
              <input
                type="time"
                value={globalJoinStart}
                onChange={(e) => setGlobalJoinStart(e.target.value)}
                style={{ ...adminInput, width: "100%", marginTop: 6 }}
              />
            </label>

            <label style={{ fontSize: 12, color: "#666" }}>
              受付終了
              <input
                type="time"
                value={globalJoinEnd}
                onChange={(e) => setGlobalJoinEnd(e.target.value)}
                style={{ ...adminInput, width: "100%", marginTop: 6 }}
              />
            </label>
          </div>
        </section>

        <section style={{ ...adminCard, marginTop: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
            募集締切（forming/waiting TTL）
          </h2>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              color: "#667085",
              lineHeight: 1.5,
            }}
          >
            通常「入る」の募集セッション有効時間。超過した forming/waiting は募集停止（expired）扱いになります。
          </p>

          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {(
              [
                { value: "5", label: "5分" },
                { value: "10", label: "10分" },
                { value: "15", label: "15分" },
                { value: "unlimited", label: "無制限" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                style={{
                  fontSize: 13,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border:
                    recruitmentTtlMode === opt.value
                      ? "2px solid #111827"
                      : "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="recruitmentTtlMode"
                  checked={recruitmentTtlMode === opt.value}
                  onChange={() => setRecruitmentTtlMode(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </section>

        <section style={{ ...adminCard, marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>未成年登録</h2>
            <span
              style={{
                display: "inline-flex",
                padding: "4px 10px",
                borderRadius: 999,
                background: minorsEnabled ? "#dbeafe" : "#f3f4f6",
                color: minorsEnabled ? "#1d4ed8" : "#374151",
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              {minorsEnabled ? "未成年登録 ON" : "未成年登録 OFF"}
            </span>
          </div>

          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              color: "#667085",
              lineHeight: 1.5,
            }}
          >
            18歳未満のプロフィール登録を許可します。本番初期運用ではOFF推奨。
            {productionAgeLocked
              ? " 現在の環境では本番二重ロックにより保存できません。"
              : ""}
          </p>

          {minorsEnabled ? (
            <label
              style={{
                marginTop: 10,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                fontSize: 12,
                color: "#b45309",
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={minorsRiskAck}
                onChange={(e) => setMinorsRiskAck(e.target.checked)}
              />
              <span>
                未成年許可は検証環境専用であること、法務確認が必要であること、成人/未成年分離と通報強化が必要であることを理解しました。
              </span>
            </label>
          ) : null}

          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              display: "grid",
              gap: 10,
            }}
          >
            <label
              style={{
                fontSize: 13,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                type="checkbox"
                checked={minorsEnabled}
                onChange={(e) => {
                  setMinorsEnabled(e.target.checked);
                  if (!e.target.checked) setMinorsRiskAck(false);
                }}
              />
              18歳未満のプロフィール登録を許可する
            </label>
          </div>
        </section>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={busy}
            style={{ ...adminBtn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "保存中…" : "設定を保存"}
          </button>
        </div>
      </div>
    </main>
  );
}
