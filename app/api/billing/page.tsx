// app/billing/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getOrCreateDeviceId } from "@/lib/device";

async function readJsonOrThrow(r: Response) {
  const ct = r.headers.get("content-type") ?? "";
  const raw = await r.text();
  if (!ct.includes("application/json")) {
    console.error("Non-JSON response:", raw);
    throw new Error("non_json_response");
  }
  const j = JSON.parse(raw);
  if (!r.ok) throw new Error(j?.error ?? "request_failed");
  return j;
}

export default function BillingPage() {
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
  }, []);

  const canOpen = useMemo(() => !!deviceId && !busy, [deviceId, busy]);

  async function openPortal() {
    if (!deviceId) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });

      const j = await readJsonOrThrow(r);

      if (j?.url) {
        window.location.href = j.url;
        return;
      }
      setMsg("portal url missing");
    } catch (e: any) {
      // customer_not_found は「まだ課金してない人」なので優しい文にする
      const m = String(e?.message ?? "");
      if (m.includes("customer_not_found")) {
        setMsg("まだ有料プランの契約がありません。課金後にここから解約・管理できます。");
      } else {
        setMsg(m || "portal_failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, color: "#111" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>お支払い・解約</h1>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
            解約 / 支払い方法変更 / 請求履歴は Stripe の画面で行います
          </div>
        </div>
        <Link href="/class" style={{ color: "#111" }}>
          戻る
        </Link>
      </header>

      <section style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 18, padding: 16, background: "#fff" }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>プランの管理</div>
        <div style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>
          有料プランの解約や支払い方法の変更は、Stripeが提供する安全な管理画面で行えます。
          <br />
          ※カード番号は本サービスのサーバーには保存されません。
        </div>

        <button
          onClick={openPortal}
          disabled={!canOpen}
          style={{
            marginTop: 12,
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: canOpen ? "pointer" : "not-allowed",
          }}
        >
          {busy ? "開いています…" : "Stripeで解約・管理する"}
        </button>

        {msg ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "#b00020", fontWeight: 800 }}>
            {msg}
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: 12, fontSize: 12, color: "#666", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 800, color: "#333", marginBottom: 6 }}>補足</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>解約はいつでも可能です（次回更新日までは利用できます）。</li>
          <li>決済はStripeにより処理され、カード情報は当サービスでは扱いません。</li>
        </ul>
      </section>
    </main>
  );
}
