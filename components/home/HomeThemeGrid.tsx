"use client";

import Link from "next/link";
import { withDev } from "@/lib/withDev";

export type HomeThemeCardId = "game" | "music" | "study" | "chat";

type ThemeCard = {
  id: HomeThemeCardId;
  title: string;
  hint: string;
  href: string;
  tone: string;
};

/** Navigation affordances into /class/select — not invented live rooms. */
const THEME_CARDS: ThemeCard[] = [
  {
    id: "game",
    title: "ゲーム",
    hint: "一緒に遊ぶ",
    href: "/class/select",
    tone: "game",
  },
  {
    id: "music",
    title: "音楽",
    hint: "聴いて話す",
    href: "/class/select",
    tone: "music",
  },
  {
    id: "study",
    title: "勉強",
    hint: "集中できる場",
    href: "/class/select",
    tone: "study",
  },
  {
    id: "chat",
    title: "雑談",
    hint: "気軽に話す",
    href: "/class/select",
    tone: "chat",
  },
];

function ThemeGlyph({ id }: { id: HomeThemeCardId }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (id) {
    case "game":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="11" rx="3" />
          <path d="M8 13h0M8 13v0" />
          <circle cx="16" cy="12" r="1" />
          <circle cx="18.5" cy="14.5" r="1" />
          <path d="M7 13h2M8 12v2" />
        </svg>
      );
    case "music":
      return (
        <svg {...common}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "study":
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      );
  }
}

type HomeThemeGridProps = {
  className?: string;
  title?: string;
};

export function HomeThemeGrid({
  className,
  title = "探す",
}: HomeThemeGridProps) {
  return (
    <section
      className={["cm-home-theme-grid", className].filter(Boolean).join(" ")}
    >
      <div className="cm-home-section-head">
        <h2 className="cm-home-section-title">{title}</h2>
        <Link href={withDev("/class/select")} className="cm-home-section-link">
          一覧
        </Link>
      </div>
      <div className="cm-home-theme-grid-list">
        {THEME_CARDS.map((card) => (
          <Link
            key={card.id}
            href={withDev(card.href)}
            className={`cm-home-theme-card cm-home-theme-card--${card.tone}`}
          >
            <span className="cm-home-theme-card-icon">
              <ThemeGlyph id={card.id} />
            </span>
            <span className="cm-home-theme-card-title">{card.title}</span>
            <span className="cm-home-theme-card-hint">{card.hint}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
