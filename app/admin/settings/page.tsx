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
type SaveStatus = "idle" | "saving" | "success" | "error";

export default function AdminSettingsPage() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [billingSaveStatus, setBillingSaveStatus] = useState<SaveStatus>("idle");
  const [billingSaveError, setBillingSaveError] = useState("");

  const [slotBillingEnabled, setSlotBillingEnabled] = useState(true);
  const [themeBillingEnabled, setThemeBillingEnabled] = useState(false);
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

      const hasSlot = typeof settings.slot_billing_enabled === "boolean";
      const hasTheme = typeof settings.theme_billing_enabled === "boolean";
      if (hasSlot || hasTheme) {
        setSlotBillingEnabled(settings.slot_billing_enabled !== false);
        setThemeBillingEnabled(settings.theme_billing_enabled === true);
      } else {
        const legacy = settings.billing_enabled === true;
        setSlotBillingEnabled(legacy);
        setThemeBillingEnabled(legacy);
      }
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

  async function saveBillingCategories(next: {
    slot_billing_enabled?: boolean;
    theme_billing_enabled?: boolean;
  }): Promise<boolean> {
    setBillingSaveStatus("saving");
    setBillingSaveError("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      await readJsonOrThrow(res);
      setBillingSaveStatus("success");
      setMsg("課金設定を保存しました");
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "settings_save_failed";
      setBillingSaveStatus("error");
      setBillingSaveError(message);
      setMsg(message);
      return false;
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
          slot_billing_enabled: slotBillingEnabled,
          theme_billing_enabled: themeBillingEnabled,
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
      setBillingSaveStatus("success");
      setMsg("設定を保存しました");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "settings_save_failed";
      setMsg(message);
      setBillingSaveStatus("error");
      setBillingSaveError(message);
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
            課金・入校受付時間・募集締切・未成年登録を管理します。
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
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
              課金機能
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: slotBillingEnabled ? "#dcfce7" : "#fee2e2",
                  color: slotBillingEnabled ? "#166534" : "#991b1b",
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                スロット {slotBillingEnabled ? "ON" : "OFF"}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: themeBillingEnabled ? "#dcfce7" : "#fee2e2",
                  color: themeBillingEnabled ? "#166534" : "#991b1b",
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                テーマ {themeBillingEnabled ? "ON" : "OFF"}
              </span>
            </div>
          </div>

          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              color: "#667085",
              lineHeight: 1.5,
            }}
          >
            カテゴリごとに新規購入・プラン変更を停止できます。既存契約の解約は引き続き利用できます。片方だけ変更してももう片方は上書きされません。
          </p>

          <label
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <input
              type="checkbox"
              checked={slotBillingEnabled}
              disabled={busy || billingSaveStatus === "saving"}
              onChange={(e) => {
                const next = e.target.checked;
                const prev = slotBillingEnabled;
                setSlotBillingEnabled(next);
                void saveBillingCategories({ slot_billing_enabled: next }).then(
                  (ok) => {
                    if (!ok) setSlotBillingEnabled(prev);
                  }
                );
              }}
            />
            クラススロット課金
          </label>

          <label
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <input
              type="checkbox"
              checked={themeBillingEnabled}
              disabled={busy || billingSaveStatus === "saving"}
              onChange={(e) => {
                const next = e.target.checked;
                const prev = themeBillingEnabled;
                setThemeBillingEnabled(next);
                void saveBillingCategories({ theme_billing_enabled: next }).then(
                  (ok) => {
                    if (!ok) setThemeBillingEnabled(prev);
                  }
                );
              }}
            />
            テーマ課金
          </label>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: 12,
              color:
                billingSaveStatus === "error"
                  ? "#991b1b"
                  : billingSaveStatus === "success"
                    ? "#166534"
                    : "#667085",
            }}
          >
            {billingSaveStatus === "saving"
              ? "保存中…"
              : billingSaveStatus === "success"
                ? "保存しました"
                : billingSaveStatus === "error"
                  ? `保存に失敗しました: ${billingSaveError}`
                  : null}
          </p>
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
                disabled={productionAgeLocked && !minorsEnabled}
                onChange={(e) => {
                  if (productionAgeLocked && e.target.checked) {
                    setMsg(
                      "本番環境では未成年許可をONにできません（ALLOW_MINORS_EXPERIMENT が必要）。"
                    );
                    return;
                  }
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
