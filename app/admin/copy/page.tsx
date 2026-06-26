"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  adminBtn,
  adminBtnGhost,
  adminCard,
  adminFieldLabel,
  adminInput,
  adminPageInner,
  adminPageMain,
  adminTextarea,
  readJsonOrThrow,
} from "@/app/admin/adminUi";
import {
  DEFAULT_BILLING_COPY,
  normalizeBillingCopy,
  type BillingCopySettings,
} from "@/lib/billingCopySettings";

function CopyField({
  label,
  value,
  onChange,
  rows = 1,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label style={adminFieldLabel}>
      {label}
      {rows > 1 ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          style={adminTextarea}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={adminInput}
        />
      )}
    </label>
  );
}

export default function AdminCopyPage() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<BillingCopySettings>(DEFAULT_BILLING_COPY);

  useEffect(() => {
    void loadCopy();
  }, []);

  async function loadCopy() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const sj = await readJsonOrThrow(res);
      setCopy(normalizeBillingCopy(sj.settings?.billing_copy, sj.settings?.billing_notice));
      setMsg("読み込みOK");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCopy() {
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billing_copy: copy }),
      });
      await readJsonOrThrow(res);
      setMsg("文言を保存しました");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "copy_save_failed");
    } finally {
      setBusy(false);
    }
  }

  function patchNotice<K extends keyof BillingCopySettings["notice"]>(
    key: K,
    value: BillingCopySettings["notice"][K]
  ) {
    setCopy((prev) => ({
      ...prev,
      notice: { ...prev.notice, [key]: value },
    }));
  }

  function patchPremium<K extends keyof BillingCopySettings["premium"]>(
    key: K,
    value: BillingCopySettings["premium"][K]
  ) {
    setCopy((prev) => ({
      ...prev,
      premium: { ...prev.premium, [key]: value },
    }));
  }

  function patchThemeTopics<K extends keyof BillingCopySettings["themeTopics"]>(
    key: K,
    value: BillingCopySettings["themeTopics"][K]
  ) {
    setCopy((prev) => ({
      ...prev,
      themeTopics: { ...prev.themeTopics, [key]: value },
    }));
  }

  function patchBillingPage<K extends keyof BillingCopySettings["billingPage"]>(
    key: K,
    value: BillingCopySettings["billingPage"][K]
  ) {
    setCopy((prev) => ({
      ...prev,
      billingPage: { ...prev.billingPage, [key]: value },
    }));
  }

  function patchSupport<K extends keyof BillingCopySettings["support"]>(
    key: K,
    value: BillingCopySettings["support"][K]
  ) {
    setCopy((prev) => ({
      ...prev,
      support: { ...prev.support, [key]: value },
    }));
  }

  return (
    <main style={adminPageMain}>
      <div style={adminPageInner}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
            課金・プラン文言
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#667085" }}>
            プラン画面・支払い管理画面に表示されるヘルプ文や案内文を編集します。
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
              onClick={() => void loadCopy()}
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

        <section style={{ ...adminCard, marginTop: 12, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
            プラン画面・支払い管理の注意文（? ヘルプ）
          </h2>
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
              checked={copy.notice.enabled}
              onChange={(e) => patchNotice("enabled", e.target.checked)}
            />
            課金ページに表示する
          </label>
          <CopyField
            label="ヘルプのラベル"
            value={copy.notice.label}
            onChange={(v) => patchNotice("label", v)}
          />
          <CopyField
            label="表示文言"
            value={copy.notice.text}
            onChange={(v) => patchNotice("text", v)}
            rows={5}
          />
        </section>

        <section style={{ ...adminCard, marginTop: 12, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>プラン画面</h2>
          <CopyField
            label="テーマプラン見出し"
            value={copy.premium.topicPlanSectionTitle}
            onChange={(v) => patchPremium("topicPlanSectionTitle", v)}
          />
          <CopyField
            label="テーマプラン ヘルプラベル"
            value={copy.premium.topicPlanHelpLabel}
            onChange={(v) => patchPremium("topicPlanHelpLabel", v)}
          />
          <CopyField
            label="テーマプラン ヘルプ本文"
            value={copy.premium.topicPlanHelp}
            onChange={(v) => patchPremium("topicPlanHelp", v)}
            rows={3}
          />
          <CopyField
            label="クラス枠見出し"
            value={copy.premium.classSlotSectionTitle}
            onChange={(v) => patchPremium("classSlotSectionTitle", v)}
          />
          <CopyField
            label="クラス枠 ヘルプラベル"
            value={copy.premium.classSlotHelpLabel}
            onChange={(v) => patchPremium("classSlotHelpLabel", v)}
          />
          <CopyField
            label="クラス枠 ヘルプ本文"
            value={copy.premium.classSlotHelp}
            onChange={(v) => patchPremium("classSlotHelp", v)}
            rows={2}
          />
        </section>

        <section style={{ ...adminCard, marginTop: 12, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
            テーマ一覧セクション
          </h2>
          <CopyField
            label="見出し"
            value={copy.themeTopics.heading}
            onChange={(v) => patchThemeTopics("heading", v)}
          />
          <CopyField
            label="ヘルプラベル"
            value={copy.themeTopics.helpLabel}
            onChange={(v) => patchThemeTopics("helpLabel", v)}
          />
          <CopyField
            label="ヘルプ本文（前半）"
            value={copy.themeTopics.intro}
            onChange={(v) => patchThemeTopics("intro", v)}
            rows={2}
          />
          <CopyField
            label="ヘルプ本文（後半）"
            value={copy.themeTopics.changeNote}
            onChange={(v) => patchThemeTopics("changeNote", v)}
            rows={2}
          />
          <CopyField
            label="テーマが0件のときの文言"
            value={copy.themeTopics.emptyMessage}
            onChange={(v) => patchThemeTopics("emptyMessage", v)}
          />
        </section>

        <section style={{ ...adminCard, marginTop: 12, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>支払い管理画面</h2>
          <CopyField
            label="タイトル横ヘルプラベル"
            value={copy.billingPage.titleHelpLabel}
            onChange={(v) => patchBillingPage("titleHelpLabel", v)}
          />
          <CopyField
            label="タイトル横ヘルプ本文"
            value={copy.billingPage.titleHelp}
            onChange={(v) => patchBillingPage("titleHelp", v)}
            rows={2}
          />
        </section>

        <section style={{ ...adminCard, marginTop: 12, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
            課金サポート・トラブル案内
          </h2>
          <CopyField
            label="課金管理セクション見出し"
            value={copy.support.sectionTitle}
            onChange={(v) => patchSupport("sectionTitle", v)}
          />
          <CopyField
            label="Stripeヘルプラベル"
            value={copy.support.portalTooltipLabel}
            onChange={(v) => patchSupport("portalTooltipLabel", v)}
          />
          <CopyField
            label="Stripeヘルプ本文"
            value={copy.support.portalTooltip}
            onChange={(v) => patchSupport("portalTooltip", v)}
            rows={4}
          />
          <CopyField
            label="Stripeリンクボタン文言"
            value={copy.support.portalLoginLabel}
            onChange={(v) => patchSupport("portalLoginLabel", v)}
          />
          <CopyField
            label="Stripeリンク未設定時の文言"
            value={copy.support.portalUnavailableSuffix}
            onChange={(v) => patchSupport("portalUnavailableSuffix", v)}
            rows={2}
          />
          <CopyField
            label="β期間ヘルプラベル"
            value={copy.support.betaNoticeLabel}
            onChange={(v) => patchSupport("betaNoticeLabel", v)}
          />
          <CopyField
            label="β期間ヘルプ本文"
            value={copy.support.betaNotice}
            onChange={(v) => patchSupport("betaNotice", v)}
            rows={4}
          />
          <CopyField
            label="トラブル案内（折りたたみ見出し）"
            value={copy.support.troublesSummary}
            onChange={(v) => patchSupport("troublesSummary", v)}
          />
          <CopyField
            label="お問い合わせ案内"
            value={copy.support.contactHelp}
            onChange={(v) => patchSupport("contactHelp", v)}
            rows={3}
          />
          <CopyField
            label="お問い合わせに必要な情報（1行1項目）"
            value={copy.support.contactInfoItems.join("\n")}
            onChange={(v) =>
              patchSupport(
                "contactInfoItems",
                v
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
              )
            }
            rows={5}
          />
          <CopyField
            label="サポートメールアドレス"
            value={copy.support.supportEmail}
            onChange={(v) => patchSupport("supportEmail", v)}
          />
          <CopyField
            label="メール表示の前置き"
            value={copy.support.contactEmailPrefix}
            onChange={(v) => patchSupport("contactEmailPrefix", v)}
          />
        </section>

        <div style={{ marginTop: 12, marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => void saveCopy()}
            disabled={busy}
            style={{ ...adminBtn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "保存中…" : "文言を保存"}
          </button>
        </div>
      </div>
    </main>
  );
}
