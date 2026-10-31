"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { withDev } from "@/lib/withDev";

export type MobileBottomNavTabId =
  | "home"
  | "discover"
  | "mine"
  | "plan"
  | "menu";

type TabDef =
  | {
      id: Exclude<MobileBottomNavTabId, "menu">;
      href: string;
      label: string;
      match: (pathname: string) => boolean;
    }
  | {
      id: "menu";
      label: string;
    };

const TABS: TabDef[] = [
  {
    id: "home",
    href: "/",
    label: "ホーム",
    match: (p) => p === "/" || p === "",
  },
  {
    id: "discover",
    href: "/class/select",
    label: "探す",
    match: (p) => p.startsWith("/class/select"),
  },
  {
    id: "mine",
    href: "/class/mine",
    label: "マイクラス",
    match: (p) => p.startsWith("/class/mine"),
  },
  {
    id: "plan",
    href: "/premium",
    label: "プラン",
    match: (p) => p.startsWith("/premium"),
  },
  { id: "menu", label: "メニュー" },
];

type MobileBottomNavProps = {
  onMenuClick: () => void;
  menuOpen?: boolean;
  className?: string;
};

function Glyph({ id, active }: { id: MobileBottomNavTabId; active: boolean }) {
  const stroke = active ? "var(--cm-blue, #3478f6)" : "var(--cm-muted, #64748b)";
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (id) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M6 10.5V20h12v-9.5" />
        </svg>
      );
    case "discover":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "mine":
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "plan":
      return (
        <svg {...common}>
          <path d="M3 7l4 4 5-8 5 8 4-4v14H3V7z" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      );
  }
}

export default function MobileBottomNav({
  onMenuClick,
  menuOpen = false,
  className,
}: MobileBottomNavProps) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className={["cm-mobile-bottom-nav", className].filter(Boolean).join(" ")}
      aria-label="メインメニュー"
    >
      {TABS.map((tab) => {
        if (tab.id === "menu") {
          return (
            <button
              key="menu"
              type="button"
              className={[
                "cm-mobile-bottom-nav-item",
                menuOpen ? "cm-mobile-bottom-nav-item--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="メニューを開く"
              aria-expanded={menuOpen}
              onClick={onMenuClick}
            >
              <Glyph id="menu" active={menuOpen} />
              <span>{tab.label}</span>
            </button>
          );
        }

        const active = tab.match(pathname);
        return (
          <Link
            key={tab.id}
            href={withDev(tab.href)}
            className={[
              "cm-mobile-bottom-nav-item",
              active ? "cm-mobile-bottom-nav-item--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={active ? "page" : undefined}
          >
            <Glyph id={tab.id} active={active} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Routes where the web mobile bottom nav should stay hidden. */
export function shouldHideMobileBottomNav(pathname: string): boolean {
  const p = String(pathname || "");
  if (!p) return true;
  if (p.startsWith("/call")) return true;
  if (p.startsWith("/room")) return true;
  if (p.startsWith("/app")) return true;
  if (p.startsWith("/auth")) return true;
  if (p.startsWith("/login")) return true;
  if (p.startsWith("/onboarding")) return true;
  if (p.startsWith("/admin")) return true;
  return false;
}
