"use client";

import Link from "next/link";
import { isAppShellContext, resolveShellDashboardPath } from "@/lib/appShellContext";
import { withDev } from "@/lib/withDev";
import AppShellPage from "@/components/app-shell/AppShellPage";

type Props = {
  children: React.ReactNode;
};

export default function LegalPageShell({ children }: Props) {
  const isApp = isAppShellContext();
  const homeHref = withDev(resolveShellDashboardPath());

  const backLink = (
    <p style={{ margin: isApp ? "0 0 16px" : "0 0 20px" }}>
      <Link
        href={homeHref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: isApp ? "#2563eb" : "#111827",
          fontWeight: 800,
          fontSize: isApp ? 14 : 13,
          textDecoration: "none",
        }}
      >
        ← ホームへ戻る
      </Link>
    </p>
  );

  if (isApp) {
    return (
      <AppShellPage>
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            lineHeight: 1.8,
          }}
        >
          {backLink}
          {children}
        </div>
      </AppShellPage>
    );
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 20px 40px",
        lineHeight: 1.8,
      }}
    >
      {backLink}
      {children}
    </main>
  );
}
