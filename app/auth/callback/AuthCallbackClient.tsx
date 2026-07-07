"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { completeAuthCallback } from "@/lib/authClient";
import { resolveAuthCallbackReturnTo } from "@/lib/oauthRootRedirect";
import { defaultAuthCallbackReturnTo } from "@/lib/appShellContext";
import { buildShellAwareLoginUrl } from "@/lib/appShellNavigation";
import { readOAuthCallbackError } from "@/lib/authProviderErrors";
import { markAuthCallbackActive } from "@/lib/oauthCallbackDedupe";
import { withDev } from "@/lib/withDev";

export default function AuthCallbackClient() {
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => {
    return resolveAuthCallbackReturnTo(searchParams, defaultAuthCallbackReturnTo());
  }, [searchParams]);

  const oauthError = useMemo(
    () => readOAuthCallbackError(searchParams),
    [searchParams]
  );

  const callbackKey = useMemo(() => {
    return (
      searchParams.get("code") ??
      searchParams.get("token_hash") ??
      oauthError ??
      "pending"
    );
  }, [oauthError, searchParams]);

  const startedKeyRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (startedKeyRef.current === callbackKey) return;
    startedKeyRef.current = callbackKey;

    let cancelled = false;

    if (oauthError) {
      setError(oauthError);
      return () => {
        cancelled = true;
      };
    }

    markAuthCallbackActive();

    void (async () => {
      const deviceId = getDeviceId();
      if (!deviceId) {
        if (!cancelled) setError("端末情報を取得できませんでした。");
        return;
      }

      const result = await completeAuthCallback(deviceId, withDev(returnTo));
      if (!cancelled && !result.ok) {
        if (
          result.error === "profile_device_conflict" ||
          result.error === "profile_user_mismatch"
        ) {
          setHint(
            "別のアカウントに紐づくプロフィールがあります。プロフィールを再登録してください。"
          );
        } else if (result.action === "restore_login") {
          setHint("この端末でアカウントを復元するには、ログインが必要です。");
        }

        setError(
          result.message ?? result.error ?? "ログイン処理に失敗しました。"
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [callbackKey, oauthError, returnTo]);

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>ログイン処理中…</h1>
      {error ? (
        <>
          {hint ? (
            <p style={{ color: "#92400e", lineHeight: 1.65, fontWeight: 700 }}>
              {hint}
            </p>
          ) : null}
          <p style={{ color: "#b91c1c", lineHeight: 1.65 }}>{error}</p>
          <p style={{ fontSize: 13 }}>
            <Link href={withDev(buildShellAwareLoginUrl(returnTo))}>
              ログイン画面へ戻る
            </Link>
            {hint ? (
              <>
                {" · "}
                <Link href={withDev(`/profile?returnTo=${encodeURIComponent(returnTo)}`)}>
                  プロフィール登録
                </Link>
              </>
            ) : null}
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
