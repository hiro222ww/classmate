"use client";

import type { CSSProperties, ReactNode } from "react";

export function LoadSpinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: "2px solid #d1d5db",
        borderTopColor: "#111827",
        display: "inline-block",
        animation: "classmate-load-spin 0.8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

export function LoadShimmerBar({
  width = 120,
  height = 12,
}: {
  width?: number | string;
  height?: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: 6,
        background:
          "linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 50%, #e5e7eb 100%)",
        backgroundSize: "200% 100%",
        animation: "classmate-load-shimmer 1.2s ease-in-out infinite",
      }}
    />
  );
}

export function MemberCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "grid", gap: 8 }} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fafafa",
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: "#e5e7eb",
              flexShrink: 0,
            }}
          />
          <div style={{ display: "grid", gap: 6, flex: 1 }}>
            <LoadShimmerBar width="40%" height={12} />
            <LoadShimmerBar width="24%" height={10} />
          </div>
        </div>
      ))}
      <LoadKeyframes />
    </div>
  );
}

export function MembersLoadingPanel({
  title = "参加メンバーを確認しています…",
  refreshing = false,
  children,
}: {
  title?: string;
  refreshing?: boolean;
  children?: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "#6b7280",
          fontWeight: 800,
          fontSize: 13,
        }}
      >
        <LoadSpinner />
        <span>{refreshing ? "参加状況を更新中…" : title}</span>
      </div>
      {children ?? <MemberCardSkeleton />}
      <LoadKeyframes />
    </div>
  );
}

export function LoadErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 12,
        borderRadius: 12,
        border: "1px solid #fecaca",
        background: "#fef2f2",
      }}
    >
      <div style={{ color: "#b91c1c", fontWeight: 800, fontSize: 13 }}>
        {message}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            width: "fit-content",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #fca5a5",
            background: "#fff",
            fontWeight: 800,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          再試行
        </button>
      ) : null}
    </div>
  );
}

function LoadKeyframes() {
  return (
    <style>{`
      @keyframes classmate-load-spin { to { transform: rotate(360deg); } }
      @keyframes classmate-load-shimmer {
        0% { background-position: 100% 0; }
        100% { background-position: -100% 0; }
      }
    `}</style>
  );
}

export const softUpdatingBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 999,
  background: "#f3f4f6",
  color: "#6b7280",
  fontSize: 11,
  fontWeight: 800,
};
