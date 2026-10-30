import type { CSSProperties, ReactNode } from "react";

type CmPageShellProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Extra bottom padding for fixed mobile bottom nav */
  withBottomNav?: boolean;
  maxWidth?: number;
};

export function CmPageShell({
  children,
  className,
  style,
  withBottomNav = false,
  maxWidth = 960,
}: CmPageShellProps) {
  return (
    <div
      className={[
        "cm-page-shell",
        withBottomNav ? "cm-page-shell--with-bottom-nav" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: "100%",
        maxWidth,
        margin: "0 auto",
        padding: withBottomNav
          ? "16px 16px max(96px, calc(72px + env(safe-area-inset-bottom, 0px)))"
          : "16px 16px 28px",
        boxSizing: "border-box",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
