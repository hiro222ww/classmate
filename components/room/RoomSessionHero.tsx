"use client";

import type { ReactNode } from "react";

export type RoomSessionStatusTone = "waiting" | "incall" | "neutral";

type Props = {
  title: string;
  /** e.g. フリークラス */
  categoryLabel?: string;
  /** e.g. 1/5人 */
  countLabel?: string;
  statusLabel?: string;
  statusTone?: RoomSessionStatusTone;
  /** Primary CTA (通話開始 etc.) — blue gradient only here */
  primaryAction?: ReactNode;
  avatarStrip?: ReactNode;
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
  className?: string;
  /** Background image URL (defaults to home hero atmosphere). */
  backgroundSrc?: string;
};

/**
 * Soft sunset-style room hero used by waiting room (PR A).
 * Compact on mobile; room name + meta + status + optional CTA + avatar strip.
 */
export function RoomSessionHero({
  title,
  categoryLabel,
  countLabel,
  statusLabel,
  statusTone = "waiting",
  primaryAction,
  avatarStrip,
  toolbarLeft,
  toolbarRight,
  className,
  backgroundSrc = "/brand/classmate-home-hero.jpg",
}: Props) {
  const metaParts = [categoryLabel, countLabel].filter(Boolean);

  return (
    <header
      className={["cm-room-session-hero", className].filter(Boolean).join(" ")}
    >
      <div className="cm-room-session-hero-media" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="cm-room-session-hero-img"
          src={backgroundSrc}
          alt=""
          decoding="async"
        />
        <div className="cm-room-session-hero-scrim" />
      </div>

      <div className="cm-room-session-hero-inner">
        {(toolbarLeft || toolbarRight) && (
          <div className="cm-room-session-hero-toolbar">
            <div className="cm-room-session-hero-toolbar-left">
              {toolbarLeft}
            </div>
            <div className="cm-room-session-hero-toolbar-right">
              {toolbarRight}
            </div>
          </div>
        )}

        <div className="cm-room-session-hero-copy">
          <h1 className="cm-room-session-hero-title">{title}</h1>
          {metaParts.length > 0 ? (
            <p className="cm-room-session-hero-meta">{metaParts.join(" · ")}</p>
          ) : null}
          {statusLabel ? (
            <span
              className={[
                "cm-room-session-status",
                `cm-room-session-status--${statusTone}`,
              ].join(" ")}
            >
              <span className="cm-room-session-status-dot" aria-hidden />
              {statusLabel}
            </span>
          ) : null}
          {primaryAction ? (
            <div className="cm-room-session-hero-cta">{primaryAction}</div>
          ) : null}
        </div>

        {avatarStrip ? (
          <div className="cm-room-session-hero-avatars">{avatarStrip}</div>
        ) : null}
      </div>
    </header>
  );
}
