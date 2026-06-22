"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { completeAuthCallback } from "@/lib/authClient";
import { withDev } from "@/lib/withDev";

function sanitizeRedirect(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/home";
  return raw;
}

export default function AuthCallbackClient() {
  const searchParams = useSearchParams();
  const redirectTo = useMemo(
    () => sanitizeRedirect(searchParams.get("redirect")),
    [searchParams]
  );

  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const deviceId = getDeviceId();
      if (!deviceId) {
        if (!cancelled) setError("端末IDを取得できませんでした。");
        return;
      }

      const result = await completeAuthCallback(deviceId, withDev(redirectTo));
      if (!cancelled && !result.ok) {
        const restoreHint =
          result.action === "restore_login"
            ? "この端末ではプロフィールを復元するため、メールログインが必要です。"
            : null;
        setError(
          [restoreHint, result.message ?? result.error ?? "ログイン処理に失敗しました."]
            .filter(Boolean)
            .join(" ")
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [redirectTo]);

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>ログイン処理中…</h1>
      {error ? (
        <>
          <p style={{ color: "#b91c1c", lineHeight: 1.65 }}>{error}</p>
          <p style={{ fontSize: 13 }}>
            <Link href={withDev("/login")}>ログイン画面へ戻る</Link>
          </p>
        </>
      ) : (
        <p style={{ color: "#6b7280", lineHeight: 1.65 }}>
          セッションを確認しています。しばらくお待ちください。
        </p>
      )}
    </main>
  );
}
