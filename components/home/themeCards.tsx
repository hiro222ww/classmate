"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { withDev } from "@/lib/withDev";
import {
  THEME_MAJOR_CATEGORIES,
  buildThemeSelectCategoryPath,
  type ThemeMajorCategoryId,
} from "@/lib/themeCatalog";

export type ThemeCardId = ThemeMajorCategoryId;

export type ThemeCardDef = {
  id: ThemeCardId;
  title: string;
  hint: string;
  tone: ThemeCardId;
};

/** Major-category affordances for home / select — mirrors themeCatalog. */
export const THEME_CARDS: ThemeCardDef[] = THEME_MAJOR_CATEGORIES.map(
  (major) => ({
    id: major.id,
    title: major.label,
    hint: major.hint,
    tone: major.tone,
  })
);

export function ThemeGlyph({ id }: { id: ThemeCardId }) {
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
    case "hobby":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="11" rx="3" />
          <circle cx="16" cy="12" r="1" />
          <circle cx="18.5" cy="14.5" r="1" />
          <path d="M7 13h2M8 12v2" />
        </svg>
      );
    case "school":
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "daily":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M9 21v-6h6v6" />
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

type ThemeCardGridProps = {
  className?: string;
  /** When set, cards are buttons that call onPick instead of links. */
  onPick?: (id: ThemeCardId) => void;
  /** Default link target when onPick is not used (ignored — uses cat deep-link). */
  href?: string;
  activeId?: ThemeCardId | null;
  trailing?: ReactNode;
  title?: string;
  listHref?: string | null;
};

export function ThemeCardGrid({
  className,
  onPick,
  activeId = null,
  title = "探す",
  listHref = "/class/select",
}: ThemeCardGridProps) {
  return (
    <section
      className={["cm-home-theme-grid", className].filter(Boolean).join(" ")}
    >
      <div className="cm-home-section-head">
        <h2 className="cm-home-section-title">{title}</h2>
        {listHref ? (
          <Link href={withDev(listHref)} className="cm-home-section-link">
            一覧
          </Link>
        ) : null}
      </div>
      <div className="cm-home-theme-grid-list">
        {THEME_CARDS.map((card) => {
          const classNameCard = [
            "cm-home-theme-card",
            `cm-home-theme-card--${card.tone}`,
            activeId === card.id ? "cm-home-theme-card--active" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const body = (
            <>
              <span className="cm-home-theme-card-icon">
                <ThemeGlyph id={card.id} />
              </span>
              <span className="cm-home-theme-card-title">{card.title}</span>
              <span className="cm-home-theme-card-hint">{card.hint}</span>
            </>
          );

          if (onPick) {
            return (
              <button
                key={card.id}
                type="button"
                className={classNameCard}
                onClick={() => onPick(card.id)}
              >
                {body}
              </button>
            );
          }

          return (
            <Link
              key={card.id}
              href={withDev(buildThemeSelectCategoryPath(card.id))}
              className={classNameCard}
            >
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
