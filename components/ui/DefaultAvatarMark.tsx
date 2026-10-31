"use client";

import { useId } from "react";

type DefaultAvatarMarkProps = {
  className?: string;
  title?: string;
};

/**
 * Pale-blue circle + neutral person silhouette.
 * Used when no profile photo is set, and as the underlay while a photo loads.
 */
export function DefaultAvatarMark({
  className,
  title,
}: DefaultAvatarMarkProps) {
  const reactId = useId().replace(/:/g, "");
  const gradientId = `cmDefaultAvatarBg-${reactId}`;

  return (
    <svg
      className={["cm-default-avatar-mark", className].filter(Boolean).join(" ")}
      viewBox="0 0 128 128"
      width="100%"
      height="100%"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : "presentation"}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="38%" r="68%">
          <stop offset="0%" stopColor="#f4f9ff" />
          <stop offset="55%" stopColor="#d7e8ff" />
          <stop offset="100%" stopColor="#b9d4f8" />
        </radialGradient>
      </defs>
      <circle cx="64" cy="64" r="64" fill={`url(#${gradientId})`} />
      <circle cx="64" cy="46" r="22" fill="#ffffff" />
      <path
        fill="#ffffff"
        d="M22 118c6.5-30 26.5-44 42-44s35.5 14 42 44c-12 6-26.5 10-42 10s-30-4-42-10z"
      />
    </svg>
  );
}
