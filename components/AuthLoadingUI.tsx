"use client";

type AuthLoadingBannerProps = {
  slow?: boolean;
  error?: string | null;
  onReload?: () => void;
  compact?: boolean;
};

/** Neutral auth-check UI — never looks like a logged-out CTA. */
export function AuthLoadingBanner({
  slow = false,
  error = null,
  onReload,
  compact = false,
}: AuthLoadingBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "grid",
        gap: compact ? 6 : 10,
        padding: compact ? "8px 10px" : "14px 16px",
        borderRadius: compact ? 12 : 16,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          aria-hidden
          style={{
            width: compact ? 14 : 18,
            height: compact ? 14 : 18,
            borderRadius: 999,
            border: "2px solid #d1d5db",
            borderTopColor: "#111827",
            display: "inline-block",
            animation: "classmate-auth-spin 0.8s linear infinite",
            flexShrink: 0,
          }}
        />
        <div style={{ display: "grid", gap: 2 }}>
          <span
            style={{
              fontSize: compact ? 12 : 14,
              fontWeight: 800,
              color: "#111827",
            }}
          >
            {slow
              ? "読み込みに時間がかかっています"
              : "アカウント情報を確認しています…"}
          </span>
          {error ? (
            <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
              {error}
            </span>
          ) : null}
        </div>
      </div>

      {(slow || error) && onReload ? (
        <button
          type="button"
          onClick={onReload}
          style={{
            width: "fit-content",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontWeight: 800,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          再読み込み
        </button>
      ) : null}

      <style>{`
        @keyframes classmate-auth-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export function AuthTextSkeleton({ width = 120 }: { width?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width,
        height: 14,
        borderRadius: 6,
        background: "linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 50%, #e5e7eb 100%)",
        backgroundSize: "200% 100%",
        animation: "classmate-auth-shimmer 1.2s ease-in-out infinite",
        verticalAlign: "middle",
      }}
    />
  );
}

export function AuthAvatarSkeleton({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: 999,
        background: "#e5e7eb",
        flexShrink: 0,
      }}
    />
  );
}

export function AuthCardSkeleton() {
  return (
    <div
      aria-hidden
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gap: 12,
        background: "#fff",
      }}
    >
      <AuthTextSkeleton width={160} />
      <div
        style={{
          height: 72,
          borderRadius: 12,
          background: "#f3f4f6",
        }}
      />
      <AuthTextSkeleton width={100} />
      <style>{`
        @keyframes classmate-auth-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </div>
  );
}
