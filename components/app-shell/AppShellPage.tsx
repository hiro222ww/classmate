"use client";

import AppShellBottomNav from "@/components/app-shell/AppShellBottomNav";

type Props = {
  children: React.ReactNode;
  showBottomNav?: boolean;
  wide?: boolean;
};

export default function AppShellPage({
  children,
  showBottomNav = true,
  wide = false,
}: Props) {
  return (
    <>
      <main
        className={[
          "app-shell-inner",
          wide ? "app-shell-inner--wide" : "",
          showBottomNav ? "app-shell-inner--with-tab" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </main>
      {showBottomNav ? <AppShellBottomNav /> : null}
    </>
  );
}
