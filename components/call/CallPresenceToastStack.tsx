"use client";

import type { CallPresenceToast } from "@/lib/callPresenceToasts";

/** Presentational join/leave toast stack shared by live call and demo. */
export default function CallPresenceToastStack({
  toasts,
}: {
  toasts: CallPresenceToast[];
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="cm-call-toast-stack"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        top: 16,
        transform: "translateX(-50%)",
        zIndex: 11000,
        display: "grid",
        gap: 8,
        width: "min(420px, calc(100vw - 24px))",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="cm-call-toast"
          style={{
            borderRadius: 12,
            padding: "10px 14px",
            background: "#111827",
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
