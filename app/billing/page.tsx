"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";

type PortalAction =
  | "update_theme"
  | "update_slots"
  | "cancel_theme"
  | "cancel_slots";

function portalConfigHint(action: PortalAction) {
  switch (action) {
    case "update_theme":
    case "cancel_theme":
      return "STRIPE_PORTAL_CONFIG_THEME";
    case "update_slots":
    case "cancel_slots":
      return "STRIPE_PORTAL_CONFIG_SLOTS";
  }
}

function BillingPageInner() {
  const searchParams = useSearchParams();
  const dev = (searchParams.get("dev") ?? "").trim();
  const devQuery = dev ? `?dev=${encodeURIComponent(dev)}` : "";

  const [loadingKey, setLoadingKey] = useState("");
  const [msg, setMsg] = useState("");

  async function openBillingPortal(action: PortalAction) {
    try {
      setLoadingKey(action);
      setMsg("");

      const deviceId = getDeviceId();

      const r = await fetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, dev, action }),
        cache: "no-store",
      });

      const text = await r.text();
      let j: { error?: string; url?: string } | null = null;

      try {
        j = text ? JSON.parse(text) : null;
      } catch {
        j = null;
      }

      if (!r.ok) {
        const errMsg = j?.error ?? `billing_portal_failed:${r.status}`;

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
            `お支払い管理の設定が未完了です。管理者に ${portalConfigHint(action)} の設定を確認してください。`
          );
          return;
        }

        setMsg(String(errMsg));
        alert(String(errMsg));
        return;
      }

      if (j?.url) {
        window.top!.location.href = j.url;
        return;
      }

      setMsg("billing portal url missing");
      alert("billing portal url missing");
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "billing_portal_failed";
      console.error(e);
      setMsg(m);
      alert(m);
    } finally {
      setLoadingKey("");
    }
  }

  const loading = loadingKey !== "";

  function renderPlanSection(params: {
    title: string;
    description: string;
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
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{params.title}</div>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              color: "#666",
              lineHeight: 1.7,
            }}
          >
            {params.description}
          </p>
        </div>

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
          <div style={{ fontSize: 13, color: "#666", fontWeight: 800 }}>
            classmate
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 900 }}>
            お支払い管理
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              color: "#666",
              lineHeight: 1.7,
            }}
          >
            クラススロットとテーマプランを分けて管理できます。プラン変更・解約は
            Stripe Portal から行います。支払い方法や請求履歴は、各プラン管理画面内で確認・変更できます。
          </p>
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
        title: "クラススロット",
        description:
          "クラス枠の変更や解約ができます。Portal 内で支払い方法・請求履歴も確認できます。",
        updateAction: "update_slots",
        cancelAction: "cancel_slots",
        updateLabel: "クラス枠を変更",
        cancelLabel: "クラス枠を解約",
      })}

      {renderPlanSection({
        title: "テーマプラン",
        description:
          "支援額の変更や解約ができます。Portal 内で支払い方法・請求履歴も確認できます。",
        updateAction: "update_theme",
        cancelAction: "cancel_theme",
        updateLabel: "支援額を変更",
        cancelLabel: "テーマプランを解約",
      })}

      <div
        style={{
          fontSize: 12,
          color: "#666",
          lineHeight: 1.7,
          padding: "0 4px",
        }}
      >
        ※ 解約は選択した種類の契約だけを対象にします。プラン変更は種類ごとの Stripe
        Portal 更新画面を開き、表示される候補だけ選べます。
      </div>

      {msg ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 14,
            padding: 12,
            fontSize: 13,
            fontWeight: 800,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </div>
      ) : null}

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
    <Suspense
      fallback={<main style={{ padding: 24 }}>読み込み中...</main>}
    >
      <BillingPageInner />
    </Suspense>
  );
}
