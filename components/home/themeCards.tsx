"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { withDev } from "@/lib/withDev";

export type ThemeCardId = "game" | "music" | "study" | "chat";

export type ThemeCardDef = {
  id: ThemeCardId;
  title: string;
  hint: string;
  tone: ThemeCardId;
  /** Optional category match keys for select filtering. */
  match: RegExp;
};

/** Visual theme affordances — not invented live rooms. */
export const THEME_CARDS: ThemeCardDef[] = [
  {
    id: "game",
    title: "ゲーム",
    hint: "一緒に遊ぶ",
    tone: "game",
    match: /ゲーム|game|esports|eスポーツ/,
  },
  {
    id: "music",
    title: "音楽",
    hint: "聴いて話す",
    tone: "music",
    match: /音楽|music|歌|メロディ/,
  },
  {
    id: "study",
    title: "勉強",
    hint: "集中できる場",
    tone: "study",
    match: /勉強|学習|study|学校|仕事/,
  },
  {
    id: "chat",
    title: "雑談",
    hint: "気軽に話す",
    tone: "chat",
    match: /雑談|交流|フリー|talk|chat|おしゃべり/,
  },
];

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
    case "game":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="11" rx="3" />
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

type ThemeCardGridProps = {
  className?: string;
  /** When set, cards are buttons that call onPick instead of links. */
  onPick?: (id: ThemeCardId) => void;
  /** Default link target when onPick is not used. */
  href?: string;
  activeId?: ThemeCardId | null;
  trailing?: ReactNode;
  title?: string;
  listHref?: string | null;
};

export function ThemeCardGrid({
  className,
  onPick,
  href = "/class/select",
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
              href={withDev(href)}
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
