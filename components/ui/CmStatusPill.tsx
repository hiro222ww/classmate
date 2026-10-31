import type { CSSProperties, ReactNode } from "react";

type CmStatusPillProps = {
  children: ReactNode;
  tone?: "neutral" | "online" | "warn" | "brand";
  className?: string;
  style?: CSSProperties;
};

const TONE: Record<NonNullable<CmStatusPillProps["tone"]>, CSSProperties> = {
  neutral: {
    background: "var(--cm-card-bg-soft, #f1f5fb)",
    color: "var(--cm-muted, #64748b)",
  },
  online: {
    background: "rgba(18, 168, 121, 0.12)",
    color: "var(--cm-online, #12a879)",
  },
  warn: {
    background: "#fff7ed",
    color: "#c2410c",
  },
  brand: {
    background: "var(--cm-blue-soft, #e7f2ff)",
    color: "var(--cm-blue, #3478f6)",
  },
};

export function CmStatusPill({
  children,
  tone = "neutral",
  className,
  style,
}: CmStatusPillProps) {
  return (
    <span
      className={["cm-status-pill", className].filter(Boolean).join(" ")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: "var(--cm-radius-pill)",
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1.2,
        ...TONE[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
