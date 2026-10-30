import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

type CmCardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article";
  children: ReactNode;
  padding?: number | string;
  interactive?: boolean;
};

export function CmCard({
  as: Tag = "section",
  children,
  className,
  style,
  padding = "16px 16px",
  interactive = false,
  ...rest
}: CmCardProps) {
  const merged: CSSProperties = {
    background: "var(--cm-card-bg, #fff)",
    border: "1px solid var(--cm-border, #e5eaf2)",
    borderRadius: "var(--cm-radius, 20px)",
    boxShadow: "var(--cm-shadow-soft, 0 2px 10px rgba(23,35,61,0.05))",
    padding,
    ...style,
  };

  return (
    <Tag
      className={["cm-card", interactive ? "cm-card--interactive" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={merged}
      {...rest}
    >
      {children}
    </Tag>
  );
}
