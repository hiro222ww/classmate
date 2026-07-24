"use client";

import { useEffect } from "react";
import MemberListAvatar from "@/components/MemberListAvatar";

type Props = {
  displayName: string;
  photoPath?: string | null;
  onClose: () => void;
  durationMs?: number;
};

export default function MemberJoinBanner({
  displayName,
  photoPath = null,
  onClose,
  durationMs = 7000,
}: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [onClose, durationMs, displayName]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 80,
        width: "min(520px, calc(100vw - 24px))",
        padding: "16px 18px",
        borderRadius: 18,
        border: "1px solid #bbf7d0",
        background: "linear-gradient(180deg, #ecfdf5 0%, #fff 70%)",
        boxShadow: "0 12px 40px rgba(15, 23, 42, 0.16)",
        display: "flex",
        gap: 14,
        alignItems: "center",
        animation: "classmate-join-banner-in 0.35s ease-out",
      }}
    >
      <MemberListAvatar
        photoPath={photoPath}
        label={displayName}
        sizePx={48}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: "#065f46" }}>
          🎉 {displayName}さんがクラスに参加しました！
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: "#047857", fontWeight: 700 }}>
          新しいメンバーが加わりました
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        style={{
          border: "none",
          background: "transparent",
          color: "#6b7280",
          fontWeight: 900,
          fontSize: 18,
          cursor: "pointer",
          lineHeight: 1,
          padding: 4,
        }}
      >
        ×
      </button>
      <style>{`
        @keyframes classmate-join-banner-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
