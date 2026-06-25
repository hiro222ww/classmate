"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BillingSupportSection } from "@/components/BillingSupportSection";
import { BillingNoticeTip } from "@/components/BillingNoticeTip";
import { getDeviceId } from "@/lib/device";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { fetchAuthStatus } from "@/lib/authClient";
import { BILLING_LINK_REQUIRED_MESSAGE } from "@/lib/billingAuthGate";
import { withDev } from "@/lib/withDev";

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

  const [loadingKey, setLoadingKey] = useState("");
  const [accountLinked, setAccountLinked] = useState<boolean | null>(null);

  useEffect(() => {
    const deviceId = getDeviceId();
    if (!deviceId) return;

    void fetchAuthStatus(deviceId).then((status) => {
      setAccountLinked(
        Boolean(status?.hasLinkedEmail) && !Boolean(status?.isAnonymous)
      );
    });
  }, []);

  async function openBillingPortal(action: PortalAction) {
    if (accountLinked === false) {
      const ok = window.confirm(
        `${BILLING_LINK_REQUIRED_MESSAGE}\n\n設定ページへ移動しますか？`
      );
      if (ok) router.push(withDev("/settings"));
      return;
    }

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

        if (errMsg === "customer_not_found") {
          alert("まだ契約がありません。プランを選択してください。");
          window.location.href = `/premium${devQuery}`;
          return;
        }

        if (errMsg === "auth_required" || errMsg === "account_link_required") {
          alert(j?.message ?? BILLING_LINK_REQUIRED_MESSAGE);
          router.push(withDev("/settings"));
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
          <h1 style={{ margin: "0", fontSize: 28, fontWeight: 900 }}>
            お支払い管理
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              color: "#666",
              lineHeight: 1.6,
            }}
          >
            プランの変更・解約は Stripe の画面で行います。
          </p>
          <div style={{ marginTop: 8 }}>
            <BillingNoticeTip label="ベータ期間中のご利用について" />
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

      {accountLinked === false ? (
        <section
          style={{
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
            borderRadius: 16,
            padding: 14,
            fontSize: 13,
            lineHeight: 1.65,
            fontWeight: 700,
          }}
        >
          {BILLING_LINK_REQUIRED_MESSAGE}{" "}
          <Link
            href={withDev("/settings")}
            style={{ color: "#111827", fontWeight: 900 }}
          >
            設定でメール連携
          </Link>
        </section>
      ) : null}

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
