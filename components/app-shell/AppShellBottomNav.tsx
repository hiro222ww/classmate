"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_HOME, APP_SETTINGS } from "@/lib/appShell";
import { withDev } from "@/lib/withDev";

const TABS = [
  { href: APP_HOME, label: "ホーム" },
  { href: APP_SETTINGS, label: "設定" },
] as const;

export default function AppShellBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="app-shell-bottom-nav" aria-label="アプリメニュー">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href === APP_HOME && pathname === "/app");
        return (
          <Link
            key={tab.href}
            href={withDev(tab.href)}
            className={[
              "app-shell-bottom-nav-item",
              active ? "app-shell-bottom-nav-item--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
