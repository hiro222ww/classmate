"use client";

import { useMemo, useState } from "react";

export const dynamic = "force-dynamic";

export default function Page() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const canSubmit = useMemo(
    () => password.trim().length > 0 && !busy,
    [password, busy]
  );

  async function login() {
    if (!canSubmit) return;

    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "login_failed");
      }

      const params = new URLSearchParams(window.location.search);
      const next = params.get("next") || "/admin";

      window.location.href = next.startsWith("/admin") ? next : "/admin";
    } catch (e: any) {
      setMsg(e?.message ?? "ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f8fafc",
        color: "#111",
        padding: 20,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 420,
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: 22,
          background: "#fff",
          boxShadow: "0 12px 32px rgba(15,23,42,0.08)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
          classmate 管理ログイン
        </h1>

        <p style={{ marginTop: 8, fontSize: 13, color: "#667085" }}>
          管理画面に入るにはパスワードを入力してください。
        </p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void login();
          }}
          placeholder="ADMIN_PASSWORD"
          autoFocus
          style={{
            width: "100%",
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        <button
          type="button"
          onClick={() => void login()}
          disabled={!canSubmit}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 999,
            border: "none",
            background: "#111827",
            color: "#fff",
            fontWeight: 900,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.55,
          }}
        >
          {busy ? "確認中…" : "ログイン"}
        </button>

        {msg ? (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "#b00020",
              fontWeight: 800,
            }}
          >
            {msg}
          </div>
        ) : null}
      </section>
    </main>
  );
}