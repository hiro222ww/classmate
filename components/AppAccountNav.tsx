"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  accountStatusLabel,
  buildLoginUrl,
  isLoggedInAccount,
  sanitizeReturnTo,
} from "@/lib/authAccount";
import { bootstrapAuthSession, fetchAuthStatus } from "@/lib/authClient";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";

const HIDDEN_PREFIXES = ["/admin", "/login", "/auth/callback"];

function shouldHideNav(pathname: string) {
  return HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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

    void (async () => {
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
    })();

    return () => {
      alive = false;
    };
  }, [hidden, pathname]);

  if (hidden) return null;

  const href = loggedIn
    ? withDev("/settings")
    : withDev(buildLoginUrl(returnTo));

  return (
    <nav
      aria-label="アカウント"
      style={{
        position: "fixed",
        top: 12,
        right: 14,
        zIndex: 60,
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
  );
}
