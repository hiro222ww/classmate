"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  accountStatusLabel,
  isLoggedInAccount,
  sanitizeReturnTo,
} from "@/lib/authAccount";
import { bootstrapAuthSession, fetchAuthStatus } from "@/lib/authClient";
import { supabaseAuthClient } from "@/lib/authClient";
import { getDeviceId } from "@/lib/device";
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

  const returnTo = useMemo(() => {
    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    return sanitizeReturnTo(path);
  }, [pathname, searchParams]);

  const [loggedIn, setLoggedIn] = useState(false);
  const [label, setLabel] = useState("Google でログイン");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (hidden) return;

    let alive = true;

    const load = async () => {
      const deviceId = getDeviceId();
      if (!deviceId) {
        if (alive) setReady(true);
        return;
      }

      try {
        await bootstrapAuthSession(deviceId);
        const json = await fetchAuthStatus(deviceId);
        if (!alive || !json) return;

        const status = {
          isAnonymous: Boolean(json.isAnonymous),
          hasLinkedEmail: Boolean(json.hasLinkedEmail),
          email: json.email ?? null,
        };
        const ok = isLoggedInAccount(status);
        setLoggedIn(ok);
        setLabel(ok ? accountStatusLabel(status) : "Google でログイン");
      } finally {
        if (alive) setReady(true);
      }
    };

    void load();

    const {
      data: { subscription },
    } = supabaseAuthClient.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        void load();
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [hidden, pathname]);

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
        <Link
          href={href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#111827",
            fontSize: 12,
            fontWeight: 800,
            textDecoration: "none",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
            opacity: ready ? 1 : 0.65,
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </Link>
      </nav>
    </header>
  );
}
