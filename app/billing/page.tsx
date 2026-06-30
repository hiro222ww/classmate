"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BillingSupportSection } from "@/components/BillingSupportSection";
import { BillingNoticeTip } from "@/components/BillingNoticeTip";
import { HelpTip } from "@/components/HelpTip";
import { useBillingCopy } from "@/hooks/useBillingCopy";
import { getDeviceId } from "@/lib/device";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { buildShellAwareLoginUrl } from "@/lib/appShellNavigation";
import { withDev } from "@/lib/withDev";
import { useRequireAccount } from "@/components/useRequireAccount";
import { useRouter } from "next/navigation";
import { useState } from "react";

type PortalAction =
  | "update_theme"
  | "update_slots"
  | "cancel_theme"
  | "cancel_slots";

function BillingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dev = (searchParams.get("dev") ?? "").trim();
  const devQuery = dev ? `?dev=${encodeURIComponent(dev)}` : "";
  const { ready, loggedIn } = useRequireAccount("/billing");
  const { copy } = useBillingCopy();

  const [loadingKey, setLoadingKey] = useState("");

  async function openBillingPortal(action: PortalAction) {
    try {
      setLoadingKey(action);

      const deviceId = getDeviceId();

      const r = await authenticatedFetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, dev, action }),
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        const errMsg = String(j?.error ?? `billing_portal_failed:${r.status}`);

        if (errMsg === "auth_required" || j?.redirectTo) {
          router.push(withDev(j?.redirectTo ?? buildShellAwareLoginUrl("/billing")));
          return;
        }

        if (errMsg === "customer_not_found") {
          alert("まだ契約がありません。プランを選択してください。");
          window.location.href = `/premium${devQuery}`;
          return;
        }

        if (errMsg.startsWith("subscription_not_found")) {
          alert("この種類の契約が見つかりません。");
          return;
        }

        if (
          errMsg.startsWith("portal_configuration_missing") ||
          errMsg.startsWith("portal_configuration_invalid")
        ) {
          alert(
            "お支払い管理の準備ができていません。しばらくしてから再度お試しください。"
          );
          return;
        }

        alert(j?.message ?? errMsg);
        return;
      }

      if (j?.url) {
        window.top!.location.href = j.url;
        return;
      }

      alert("お支払い管理ページを開けませんでした。");
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : "通信エラーが発生しました");
    } finally {
      setLoadingKey("");
    }
  }

  const loading = loadingKey !== "";

  function renderPlanSection(params: {
    title: string;
    updateAction: "update_theme" | "update_slots";
    cancelAction: "cancel_theme" | "cancel_slots";
    updateLabel: string;
    cancelLabel: string;
  }) {
    return (
      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          background: "#fff",
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900 }}>{params.title}</div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void openBillingPortal(params.updateAction)}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loadingKey === params.updateAction
            ? "開いています…"
            : params.updateLabel}
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={() => void openBillingPortal(params.cancelAction)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 14,
            border: "1px solid #fecaca",
            background: "#fff",
            color: "#991b1b",
            fontWeight: 900,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loadingKey === params.cancelAction
            ? "開いています…"
            : params.cancelLabel}
        </button>
      </section>
    );
  }

  if (!ready || !loggedIn) {
    return <main style={{ padding: 24 }}>読み込み中…</main>;
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 16px",
        color: "#111",
        display: "grid",
        gap: 18,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ margin: "0", fontSize: 28, fontWeight: 900 }}>
              お支払い管理
            </h1>
            <HelpTip
              label={copy.billingPage.titleHelpLabel}
              content={copy.billingPage.titleHelp}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <BillingNoticeTip />
          </div>
        </div>

        <Link
          href={`/class/select${devQuery}`}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#111",
            fontWeight: 900,
            textDecoration: "none",
          }}
        >
          戻る
        </Link>
      </header>

      {renderPlanSection({
        title: "クラス枠",
        updateAction: "update_slots",
        cancelAction: "cancel_slots",
        updateLabel: "クラス枠を変更",
        cancelLabel: "クラス枠を解約",
      })}

      {renderPlanSection({
        title: "テーマプラン",
        updateAction: "update_theme",
        cancelAction: "cancel_theme",
        updateLabel: "支援額を変更",
        cancelLabel: "テーマプランを解約",
      })}

      <BillingSupportSection showPortalLogin={false} showBetaNotice={false} />

      <Link
        href={`/premium${devQuery}`}
        style={{
          color: "#111",
          fontWeight: 900,
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        プランを見る
      </Link>
    </main>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>読み込み中...</main>}>
      <BillingPageInner />
    </Suspense>
  );
}
