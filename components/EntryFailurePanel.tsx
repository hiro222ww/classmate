"use client";

import { ENTRY_FAILURE_DEFAULT_MESSAGE } from "@/lib/matchJoinUserMessage";

type EntryFailurePanelProps = {
  title?: string;
  message?: string;
  errorCode?: string;
  onRetry?: () => void;
  onResetDevice?: () => void;
  retryLabel?: string;
  resetLabel?: string;
};

export function EntryFailurePanel({
  title = "入校に失敗しました",
  message = ENTRY_FAILURE_DEFAULT_MESSAGE,
  errorCode,
  onRetry,
  onResetDevice,
  retryLabel = "もう一度試す",
  resetLabel = "端末情報をリセットして入り直す",
}: EntryFailurePanelProps) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "14px 16px",
        borderRadius: 14,
        border: "1px solid #fde68a",
        background: "#fffbeb",
        color: "#92400e",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15 }}>{title}</div>
      <div style={{ marginTop: 8, lineHeight: 1.65, fontSize: 14 }}>{message}</div>
      {errorCode ? (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
          コード: {errorCode}
        </div>
      ) : null}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d97706",
              background: "#fff",
              color: "#92400e",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {retryLabel}
          </button>
        ) : null}
        {onResetDevice ? (
          <button
            type="button"
            onClick={onResetDevice}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {resetLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
