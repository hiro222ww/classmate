import type { CSSProperties } from "react";

export const CLASSMATE_EMBLEM_SRC = "/brand/classmate-emblem.png";

export type ClassmateEmblemSize = "xs" | "sm" | "md" | "lg";
export type ClassmateEmblemVariant = "default" | "muted" | "watermark";

export type ClassmateEmblemProps = {
  size?: ClassmateEmblemSize;
  variant?: ClassmateEmblemVariant;
  /** Decorative marks are hidden from assistive tech. */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Shared Classmate school-crest motif.
 * Image source is controlled by CSS `--emblem-image` so future room themes
 * can override without changing call sites.
 */
export function ClassmateEmblem({
  size = "sm",
  variant = "default",
  decorative = true,
  className = "",
  style,
}: ClassmateEmblemProps) {
  const classes = [
    "cm-emblem",
    `cm-emblem--${size}`,
    `cm-emblem--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      style={style}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Classmate"}
      aria-hidden={decorative ? true : undefined}
    />
  );
}
