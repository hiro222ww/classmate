import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

type CmButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type CmButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: CmButtonVariant;
  fullWidth?: boolean;
};

const VARIANT_STYLE: Record<CmButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--cm-primary-bg)",
    color: "#fff",
    border: "1px solid transparent",
    boxShadow: "var(--cm-primary-shadow)",
  },
  secondary: {
    background: "var(--cm-card-bg, #fff)",
    color: "var(--cm-text, #17233d)",
    border: "1px solid var(--cm-border-strong, #d8dee9)",
    boxShadow: "var(--cm-shadow-soft)",
  },
  ghost: {
    background: "rgba(255,255,255,0.72)",
    color: "var(--cm-text, #17233d)",
    border: "1px solid var(--cm-border, #e5eaf2)",
  },
  danger: {
    background: "#fff",
    color: "var(--cm-danger, #dc2626)",
    border: "1px solid #fecaca",
  },
};

export function CmButton({
  children,
  className,
  style,
  variant = "primary",
  fullWidth = false,
  type = "button",
  disabled,
  ...rest
}: CmButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={["cm-btn", `cm-btn--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 44,
        padding: "10px 16px",
        borderRadius: "var(--cm-radius-sm, 16px)",
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        width: fullWidth ? "100%" : undefined,
        ...VARIANT_STYLE[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
