"use client";

export type InAppToastItem = {
  id: string;
  classId: string;
  className: string;
  message: string;
};

type Props = {
  toasts: InAppToastItem[];
  onDismiss: (id: string) => void;
  onOpen: (toast: InAppToastItem) => void;
};

export default function InAppToastStack({
  toasts,
  onDismiss,
  onOpen,
}: Props) {
  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        display: "grid",
        gap: 10,
        zIndex: 10000,
        width: "min(360px, calc(100vw - 32px))",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            background: "#111827",
            color: "#fff",
            boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => onOpen(toast)}
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "transparent",
              color: "inherit",
              padding: "12px 14px",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: "#fbbf24",
                marginBottom: 4,
              }}
            >
              {toast.className}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.45 }}>
              {toast.message}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "#9ca3af",
                fontWeight: 700,
              }}
            >
              タップして開く
            </div>
          </button>

          <button
            type="button"
            aria-label="閉じる"
            onClick={() => onDismiss(toast.id)}
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "#d1d5db",
              fontSize: 11,
              fontWeight: 800,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        </div>
      ))}
    </div>
  );
}
