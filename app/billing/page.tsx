"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";

export default function BillingPage() {
  const searchParams = useSearchParams();
  const dev = (searchParams.get("dev") ?? "").trim();
  const devQuery = dev ? `?dev=${encodeURIComponent(dev)}` : "";

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function openBillingPortal() {
    try {
      setLoading(true);
      setMsg("");

      const deviceId = getDeviceId();

      const r = await fetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, dev }),
        cache: "no-store",
      });

      const text = await r.text();
      console.log("[billing portal] status:", r.status, "body:", text);

      let j: any = null;
      try {
        j = JSON.parse(text);
      } catch {
        j = null;
      }

      if (!r.ok) {
        const errMsg =
          j?.error ??
          (r.status === 404
            ? "api/billing/create-portal-session が見つかりません"
            : `billing_portal_failed:${r.status}`);
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
    } catch (e: any) {
      const m = String(e?.message ?? "billing_portal_failed");
      console.error(e);
      setMsg(m);
      alert(m);
    } finally {
      setLoading(false);
    }
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
            契約内容、支払い方法、請求履歴、解約は Stripe の安全な管理画面で行えます。
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

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: 18,
          background: "#fff",
          display: "grid",
          gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>管理できること</div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
            外部のStripe画面に移動します。
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {[
            ["契約内容", "現在のプラン確認"],
            ["支払い方法", "カード変更など"],
            ["請求履歴", "領収書・請求確認"],
            ["解約", "自動更新の停止"],
          ].map(([title, desc]) => (
            <div
              key={title}
              style={{
                border: "1px solid #eee",
                borderRadius: 14,
                padding: 14,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 900 }}>{title}</div>
              <div
                style={{
                  marginTop: 5,
                  fontSize: 12,
                  color: "#666",
                  lineHeight: 1.6,
                }}
              >
                {desc}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={openBillingPortal}
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
          {loading ? "開いています…" : "Stripe管理画面を開く"}
        </button>

        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.7 }}>
          ※ プラン変更は「プランを見る」ページから行ってください。
          このページは主に支払い方法・請求・解約の管理用です。
        </div>
      </section>

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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          fontSize: 14,
        }}
      >
        <Link
          href={`/premium${devQuery}`}
          style={{ color: "#555", fontWeight: 800 }}
        >
          プランを見る
        </Link>
        <Link
          href={`/class/select${devQuery}`}
          style={{ color: "#555", fontWeight: 800 }}
        >
          クラス選択へ
        </Link>
      </div>
    </main>
  );
}