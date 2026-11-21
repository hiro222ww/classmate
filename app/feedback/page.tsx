"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";
import { APP_HOME } from "@/lib/appShell";
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from "@/lib/feedback/types";

const CATEGORIES = Object.keys(FEEDBACK_CATEGORY_LABELS) as FeedbackCategory[];

export default function FeedbackPage() {
  const [deviceId, setDeviceId] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("other");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          category,
          body,
          pageContext: "feedback_form",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.detail || json?.error || "送信に失敗しました"));
        return;
      }
      setMsg(String(json.message || "送信しました"));
      setBody("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "24px 16px 48px",
        fontFamily:
          'ui-sans-serif, system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif',
      }}
    >
      <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>意見・不具合の送信</h1>
      <p style={{ color: "#64748b", marginTop: 0, lineHeight: 1.6 }}>
        製品の改善のためのフィードバックです。個人への通報・ブロックは通話画面のメニューからお願いします。
        送信内容は運営が確認します。サービス改善のため、個人が特定されにくい形で集計・分析することがあります。
      </p>

      <form onSubmit={(e) => void submit(e)}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
          種別
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 16,
            borderRadius: 8,
            border: "1px solid #cbd5e1",
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FEEDBACK_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>

        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
          内容
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={5}
          maxLength={4000}
          rows={8}
          placeholder="できるだけ具体的に（再現手順、画面名など）。氏名・電話番号・メールは書かないでください。"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            resize: "vertical",
          }}
        />

        <p style={{ fontSize: 12, color: "#94a3b8" }}>
          安全・ハラスメントに関する報告は優先対応します（自動却下しません）。
        </p>

        <button
          type="submit"
          disabled={busy || !deviceId}
          style={{
            marginTop: 8,
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            background: "#0f766e",
            color: "#fff",
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "送信中…" : "送信する"}
        </button>
      </form>

      {msg ? (
        <p style={{ color: "#166534", fontWeight: 700 }}>{msg}</p>
      ) : null}
      {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}

      <p style={{ marginTop: 24 }}>
        <Link href={withDev(APP_HOME)}>ホームへ戻る</Link>
        {" · "}
        <Link href={withDev("/app/settings")}>設定</Link>
      </p>
    </main>
  );
}
