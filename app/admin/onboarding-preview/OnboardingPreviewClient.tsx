"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  MinProfileOnboardingForm,
  type MinProfileFormValues,
} from "@/components/onboarding/MinProfileOnboardingForm";
import { JoinNewCard } from "@/components/dashboard/JoinNewCard";
import { HomeBrandVisual } from "@/components/brand/HomeBrandVisual";
import {
  HOME_DASHBOARD_LAYOUT_CSS,
} from "@/components/dashboard/dashboardStyles";

type PreviewProfile = {
  displayName: string;
  declaredAge: number;
};

/**
 * Admin-only first-registration preview.
 * Memory state only — no profile/device/match-join/storage writes.
 */
export default function OnboardingPreviewClient() {
  const [preview, setPreview] = useState<PreviewProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPreview(null);
    setNotice(null);
  }, []);

  const showShotNotice = useCallback((kind: "voice" | "chat" | "theme") => {
    const message =
      kind === "voice"
        ? "プレビューのため通話には入りません（撮影確認用）。"
        : kind === "chat"
          ? "プレビューのためチャットルームには入りません（撮影確認用）。"
          : "プレビューのためテーマ選択には進みません（撮影確認用）。";
    setNotice(message);
  }, []);

  const adminBar = (
    <div
      data-admin-preview-chrome="1"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        background: "#0f172a",
        color: "#e2e8f0",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span
          style={{
            padding: "3px 8px",
            borderRadius: 999,
            background: "#fbbf24",
            color: "#78350f",
            fontWeight: 900,
          }}
        >
          初回登録プレビュー
        </span>
        <span style={{ color: "#94a3b8" }}>
          DB・端末・match-joinは変更しません（管理者用・撮影確認）
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {preview ? (
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #475569",
              background: "#1e293b",
              color: "#f8fafc",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            最初からやり直す
          </button>
        ) : null}
        <Link
          href="/admin"
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #475569",
            background: "#1e293b",
            color: "#f8fafc",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          管理へ戻る
        </Link>
      </div>
    </div>
  );

  if (!preview) {
    return (
      <div>
        {adminBar}
        <MinProfileOnboardingForm
          key="preview-form"
          submitLabel="ホームへ進む"
          busyLabel="確認中…"
          onValidSubmit={(values: MinProfileFormValues) => {
            // In-memory only — intentionally no fetch / storage / funnel.
            setPreview({
              displayName: values.displayName,
              declaredAge: values.declaredAge,
            });
            setNotice(null);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      {adminBar}
      <div
        className="cm-classroom-scope cm-home-scope"
        style={
          {
            display: "grid",
            gap: 16,
            padding: "16px 16px 28px",
            maxWidth: 960,
            margin: "0 auto",
            color: "#111",
            minHeight: "100dvh",
            background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 48%, #f8fafc 100%)",
            ["--dash-primary-bg-full" as string]:
              "linear-gradient(180deg, #059669 0%, #10b981 42%, #34d399 100%)",
            ["--dash-primary-shadow" as string]:
              "0 1px 0 rgba(255, 255, 255, 0.22) inset, 0 8px 20px rgba(5, 150, 105, 0.3)",
          } as React.CSSProperties
        }
      >
        <style>{HOME_DASHBOARD_LAYOUT_CSS}</style>

        <HomeBrandVisual />

        <div className="cm-home-welcome cm-stagger-3">
          <p style={{ margin: 0, fontSize: 14, color: "var(--cm-text, #374151)" }}>
            ようこそ、<b>{preview.displayName}</b> さん
          </p>
        </div>

        {notice ? (
          <div
            role="status"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #fcd34d",
              background: "#fffbeb",
              color: "#92400e",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {notice}
          </div>
        ) : null}

        <div
          className={["cm-stagger-4", "cm-home-empty-emblem-wrap", "cm-home-talk-hero"].join(" ")}
          style={{ display: "grid", gap: 16 }}
        >
          <JoinNewCard
            className="home-dash-join"
            onVoiceJoin={() => showShotNotice("voice")}
            onChatJoin={() => showShotNotice("chat")}
            onThemeSelect={() => showShotNotice("theme")}
          />
        </div>
      </div>
    </div>
  );
}
