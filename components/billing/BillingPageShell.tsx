"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { isAppShellContext, resolveShellDashboardPath } from "@/lib/appShellContext";
import { sanitizeReturnTo } from "@/lib/authAccount";
import { withDev } from "@/lib/withDev";
import AppShellPage from "@/components/app-shell/AppShellPage";

type Props = {
  title: string;
  titleAside?: React.ReactNode;
  notice?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

function resolveBillingBackHref(returnTo: string | null): string {
  const fallback = resolveShellDashboardPath();
  if (!returnTo) return withDev(fallback);
  return withDev(sanitizeReturnTo(returnTo) || fallback);
}

export function useBillingBackHref(): string {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  return resolveBillingBackHref(returnTo);
}

export default function BillingPageShell({
  title,
  titleAside,
  notice,
  headerAction,
  children,
  footer,
}: Props) {
  const isApp = isAppShellContext();
  const homeHref = withDev(resolveShellDashboardPath());
  const backHref = useBillingBackHref();

  if (isApp) {
    return (
      <AppShellPage>
        <p style={{ margin: 0 }}>
          <Link
            href={homeHref}
            className="app-shell-btn app-shell-btn--ghost"
            style={{
              display: "inline-flex",
              width: "auto",
              minHeight: 40,
              padding: "8px 12px",
              fontSize: 14,
            }}
          >
            ← ホームへ戻る
          </Link>
        </p>

        <header style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <h1
                className="app-shell-title"
                style={{ fontSize: "clamp(24px, 5vw, 30px)" }}
              >
                {title}
              </h1>
              {titleAside}
            </div>
            {headerAction}
          </div>
          {notice ? <div>{notice}</div> : null}
        </header>

        <div style={{ display: "grid", gap: 16 }}>{children}</div>
        {footer}
      </AppShellPage>
    );
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 16px",
        color: "#111",
        display: "grid",
        gap: 18,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{title}</h1>
            {titleAside}
          </div>
          {notice ? <div style={{ marginTop: 8 }}>{notice}</div> : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {headerAction}
          <Link
            href={backHref}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            ← 戻る
          </Link>
        </div>
      </header>

      {children}
      {footer}
    </main>
  );
}
