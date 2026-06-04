"use client";

import { useId, useState, type ReactNode } from "react";

type HelpTipProps = {
  /** Accessible name for the trigger button */
  label: string;
  /** Tooltip body (plain text or short markup) */
  content: ReactNode;
  /** Optional label shown beside the trigger */
  children?: ReactNode;
  /** Max width of the tooltip panel */
  maxWidth?: number;
};

export function HelpTip({
  label,
  content,
  children,
  maxWidth = 280,
}: HelpTipProps) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const tooltipId = useId();
  const visible = pinned || hover;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {children}
      <button
        type="button"
        aria-label={label}
        aria-expanded={visible}
        aria-describedby={visible ? tooltipId : undefined}
        onClick={() => setPinned((value) => !value)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onBlur={() => setHover(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setPinned(false);
            setHover(false);
          }
        }}
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: 999,
          border: "1px solid #cbd5e1",
          background: visible ? "#eff6ff" : "#fff",
          color: "#2563eb",
          fontWeight: 900,
          fontSize: 12,
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
        }}
      >
        ?
      </button>
      {visible ? (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            fontSize: 12,
            color: "#475569",
            fontWeight: 700,
            lineHeight: 1.55,
            maxWidth,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
          }}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
