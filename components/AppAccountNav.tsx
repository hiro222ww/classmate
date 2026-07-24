"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { sanitizeReturnTo } from "@/lib/authAccount";
import { useAuth } from "@/components/AuthProvider";
import { AuthLoadingBanner } from "@/components/AuthLoadingUI";
import { isAppShellPath } from "@/lib/appShell";
import { isAppShellContext } from "@/lib/appShellContext";
import { isImmersiveShellPath } from "@/lib/immersiveShellPaths";
import {
  buildShellAwareLoginUrl,
  buildShellAwareSettingsUrl,
} from "@/lib/appShellNavigation";
import { withDev } from "@/lib/withDev";

const HIDDEN_PREFIXES = [
  "/admin",
  "/login",
  "/auth/callback",
  "/privacy",
  "/terms",
  "/guidelines",
  "/about",
  "/legal",
];
const DASHBOARD_HEADER_PATHS = new Set(["/", "/class/select"]);

function shouldHideNav(pathname: string) {
  if (isAppShellPath(pathname)) return true;
  if (isAppShellContext() && isImmersiveShellPath(pathname)) return true;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  return DASHBOARD_HEADER_PATHS.has(pathname);
}

export default function AppAccountNav() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const hidden = shouldHideNav(pathname);
  const { status, loggedIn, accountLabel, slow, error } = useAuth();

  const returnTo = useMemo(() => {
    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    return sanitizeReturnTo(path);
  }, [pathname, searchParams]);

  if (hidden) return null;

  const href = loggedIn
    ? withDev(buildShellAwareSettingsUrl())
    : withDev(buildShellAwareLoginUrl(returnTo));

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        minHeight: 44,
        padding: "6px 14px",
        background: "rgba(255, 255, 255, 0.95)",
        borderBottom: "1px solid #f3f4f6",
        backdropFilter: "blur(6px)",
      }}
    >
      <nav
        aria-label="アカウント"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        {status === "loading" ? (
          <div style={{ maxWidth: 280 }}>
            <AuthLoadingBanner
              compact
              slow={slow}
              error={error}
              onReload={() => {
                window.location.reload();
              }}
            />
          </div>
        ) : (
          <Link
            href={href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 12px",
              borderRadius: 999,
              border: loggedIn ? "1px solid #dbeafe" : "1px solid #e5e7eb",
              background: loggedIn ? "#eff6ff" : "#fff",
              color: "#111827",
              fontSize: 12,
              fontWeight: 800,
              textDecoration: "none",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {accountLabel}
          </Link>
        )}
      </nav>
    </header>
  );
}
