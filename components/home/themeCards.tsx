"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { withDev } from "@/lib/withDev";
import {
  THEME_OFFER_COMING_SOON_LABEL,
  buildThemeSelectAllPath,
  buildThemeSelectCategoryPath,
  listFeaturedHomeMajorCategories,
  listThemeMajorCategories,
  type ThemeMajorCategoryDef,
  type ThemeMajorCategoryId,
} from "@/lib/themeCatalog";

export type ThemeCardId = ThemeMajorCategoryId;

export type ThemeCardDef = {
  id: ThemeCardId;
  title: string;
  hint: string;
  tone: ThemeCardId;
};

function toCardDef(major: ThemeMajorCategoryDef): ThemeCardDef {
  return {
    id: major.id,
    title: major.label,
    hint: major.hint,
    tone: major.tone,
  };
}

/** All majors — prefer listThemeMajorCategories() for ordering. */
export const THEME_CARDS: ThemeCardDef[] =
  listThemeMajorCategories().map(toCardDef);

/** Home representative set (≤ 4). */
export const FEATURED_THEME_CARDS: ThemeCardDef[] =
  listFeaturedHomeMajorCategories().map(toCardDef);

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
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      );
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
    case "relationship":
      return (
        <svg {...common}>
          <path d="M19.5 12.5c1.5-1.6 1.5-4.1 0-5.7a3.8 3.8 0 0 0-5.5 0L12 8.8l-2-2a3.8 3.8 0 0 0-5.5 0c-1.5 1.6-1.5 4.1 0 5.7L12 20l7.5-7.5z" />
        </svg>
      );
    case "identity":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "beauty":
      return (
        <svg {...common}>
          <path d="M12 3c2.5 3.5 6 5.2 6 9a6 6 0 1 1-12 0c0-3.8 3.5-5.5 6-9z" />
        </svg>
      );
    case "sports":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8M3.6 15h16.8" />
          <path d="M12 3a14 14 0 0 1 0 18A14 14 0 0 1 12 3z" />
        </svg>
      );
    case "career":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="12" rx="2" />
          <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M3 13h18" />
        </svg>
      );
    case "creative":
      return (
        <svg {...common}>
          <path d="M12 19 5 12l7-9 7 9-7 7z" />
          <path d="M12 19v3" />
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
  /**
   * `featured` — home representative majors (≤4).
   * `all` — full catalog for 探す一覧.
   */
  variant?: "featured" | "all";
  /** Override card source when needed. */
  categories?: readonly ThemeMajorCategoryDef[];
  showComingSoonHint?: boolean;
};

export function ThemeCardGrid({
  className,
  onPick,
  activeId = null,
  title = "探す",
  listHref = "/class/select",
  variant = "featured",
  categories,
  showComingSoonHint = false,
}: ThemeCardGridProps) {
  const majors =
    categories ??
    (variant === "all"
      ? listThemeMajorCategories()
      : listFeaturedHomeMajorCategories());

  const resolvedListHref =
    listHref === null
      ? null
      : listHref === "/class/select"
        ? buildThemeSelectAllPath()
        : listHref;

  return (
    <section
      className={["cm-home-theme-grid", className].filter(Boolean).join(" ")}
    >
      <div className="cm-home-section-head">
        <h2 className="cm-home-section-title">{title}</h2>
        {resolvedListHref ? (
          <Link href={withDev(resolvedListHref)} className="cm-home-section-link">
            一覧
          </Link>
        ) : null}
      </div>
      <div className="cm-home-theme-grid-list">
        {majors.map((major) => {
          const card = toCardDef(major);
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
              <span className="cm-home-theme-card-hint">
                {showComingSoonHint && major.status === "coming_soon"
                  ? THEME_OFFER_COMING_SOON_LABEL
                  : card.hint}
              </span>
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
