// app/billing/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { getOrCreateDeviceId } from "@/lib/device";

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function openBillingPortal() {
  try {
    setLoading(true);
    setMsg("");

    const deviceId = getOrCreateDeviceId();

    const r = await fetch("/api/billing/create-portal-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId }),
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
      window.location.href = j.url;
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
    <main className="max-w-md mx-auto px-5 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">解約・支払い管理</h1>
        <p className="text-gray-600 leading-relaxed">
          Stripe の管理画面で、支払い方法の変更、
          請求確認、解約を行えます。
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 space-y-2">
        <div>できること</div>
        <ul className="list-disc pl-5 space-y-1 text-gray-600">
          <li>支払い方法の変更</li>
          <li>請求履歴の確認</li>
          <li>現在の契約確認</li>
          <li>解約</li>
        </ul>
      </div>

      <button
        type="button"
        className="w-full py-3 rounded-lg bg-black text-white font-semibold disabled:opacity-50"
        disabled={loading}
        onClick={openBillingPortal}
      >
        {loading ? "開いています…" : "Stripe管理画面を開く"}
      </button>

      {msg ? (
        <div className="text-sm font-semibold text-red-600 whitespace-pre-wrap">
          {msg}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-sm">
        <Link className="text-gray-600 underline" href="/premium">
          Premium に戻る
        </Link>
        <Link className="text-gray-600 underline" href="/class/select">
          クラス選択へ
        </Link>
      </div>
    </main>
  );
}