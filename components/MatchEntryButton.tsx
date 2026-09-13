"use client";

import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  mode: "voice" | "chat";
  /** Unavailable themes and prerequisite/status actions stay visually neutral. */
  muted?: boolean;
};

export function MatchEntryButton({ mode, muted = false, className = "", children, ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={`cm-entry-button cm-entry-button--${muted ? "muted" : mode} ${className}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {mode === "voice" ? (
          <>
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
          </>
        ) : (
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z" />
        )}
      </svg>
      <span>{children ?? (mode === "voice" ? "通話で始める" : "チャットで始める")}</span>
    </button>
  );
}
