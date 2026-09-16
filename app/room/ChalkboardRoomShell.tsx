"use client";

import Link from "next/link";
import React from "react";
import { isAppShellContext, resolveShellDashboardPath } from "@/lib/appShellContext";
import { withDev } from "@/lib/withDev";

/** Future anime-collab / mascot overlays on the classroom blackboard. */
export type ChalkboardCharacter = {
  id: string;
  src: string;
  alt: string;
  /** Where the character stands relative to the chalk writing. */
  side?: "left" | "right" | "center";
};

type Props = {
  title: string;
  subtitle?: string;
  lines?: string[];
  right?: React.ReactNode;
  children: React.ReactNode;

  onBack?: () => void;
  /** Toolbar back label (default: 戻る) */
  backLabel?: string;
  onHome?: () => void;
  /** Toolbar primary exit label (default: ホーム) */
  homeLabel?: string;
  /** Fallback Link target when onHome is omitted */
  homeHref?: string;
  onStartCall?: () => void;
  startDisabled?: boolean;
  startLabel?: string;

  returnTo?: string;
  /** Optional collab characters standing in front of the board. */
  characters?: ChalkboardCharacter[];
};

const WEB_GHOST_BTN: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  background: "#f2f2f2",
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
  fontSize: 13,
  border: "none",
  cursor: "pointer",
};

export function ChalkboardRoomShell({
  title,
  subtitle,
  lines = ["通話を開始する際は，通話開始ボタン(青)を押してください"],
  right,
  children,
  onBack,
  backLabel = "戻る",
  onHome,
  homeLabel = "ホーム",
  homeHref: homeHrefProp,
  onStartCall,
  startDisabled = false,
  startLabel = "通話を開始",
  characters = [],
}: Props) {
  const isApp = isAppShellContext();
  const subtitleText = String(subtitle ?? "").trim();
  const boardTitle = subtitleText ? `${title} (${subtitleText})` : title;

  const moveHref = withDev("/class/select");
  const homeHref = withDev(
    homeHrefProp ?? (isApp ? resolveShellDashboardPath() : "/")
  );
  const ghostBtnClass = [
    "cm-room-ghost-btn",
    isApp ? "app-shell-btn app-shell-btn--ghost" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const primaryBtnClass = [
    "cm-cta-primary",
    "cm-room-start-btn",
    isApp ? "app-shell-btn app-shell-btn--primary" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mainClass = [
    "cm-classroom-scope",
    "cm-room-scope",
    isApp ? "app-immersive-inner app-immersive-inner--wide" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const leftChars = characters.filter((c) => (c.side ?? "left") === "left");
  const centerChars = characters.filter((c) => c.side === "center");
  const rightChars = characters.filter((c) => c.side === "right");
  const hasCharacters = characters.length > 0;

  return (
    <main
      className={mainClass}
      style={
        isApp
          ? undefined
          : { padding: 16, maxWidth: 980, margin: "0 auto" }
      }
    >
      <div
        className={
          isApp ? "app-immersive-toolbar cm-room-toolbar" : "cm-room-toolbar"
        }
        style={
          isApp
            ? undefined
            : {
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }
        }
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={ghostBtnClass}
            style={isApp ? undefined : WEB_GHOST_BTN}
          >
            {backLabel}
          </button>
        ) : null}

        {onStartCall ? (
          <button
            type="button"
            onClick={onStartCall}
            disabled={startDisabled}
            className={primaryBtnClass}
            style={
              isApp
                ? undefined
                : {
                    ...WEB_GHOST_BTN,
                    background: startDisabled ? "#d1d5db" : "#2563eb",
                    color: "#fff",
                    cursor: startDisabled ? "not-allowed" : "pointer",
                    opacity: startDisabled ? 0.7 : 1,
                  }
            }
          >
            {startLabel}
          </button>
        ) : null}

        <Link
          href={moveHref}
          className={ghostBtnClass}
          style={isApp ? undefined : WEB_GHOST_BTN}
        >
          移動
        </Link>

        {onHome ? (
          <button
            type="button"
            onClick={onHome}
            className={ghostBtnClass}
            style={isApp ? undefined : WEB_GHOST_BTN}
          >
            {homeLabel}
          </button>
        ) : (
          <Link
            href={homeHref}
            className={ghostBtnClass}
            style={isApp ? undefined : WEB_GHOST_BTN}
          >
            {homeLabel}
          </Link>
        )}

        {right}
      </div>

      <div
        className={`cm-room-board-wrap${hasCharacters ? " has-characters" : ""}`}
        style={{ marginTop: 8 }}
      >
        <div
          className={
            isApp
              ? "app-immersive-board cm-room-chalkboard"
              : "cm-room-chalkboard"
          }
        >
          <div className="cm-room-chalkboard-surface" aria-hidden />
          <div className="cm-room-chalkboard-writing">
            <div
              className={
                isApp
                  ? "app-immersive-board-title cm-room-board-title"
                  : "cm-room-board-title"
              }
            >
              {boardTitle}
            </div>

            {lines.length > 0 ? (
              <div className="cm-room-board-lines">
                {lines.map((t, i) => (
                  <div key={i} className="cm-room-board-line">
                    {t}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="cm-room-chalkboard-tray" aria-hidden>
            <span className="cm-room-chalkboard-chalk" />
            <span className="cm-room-chalkboard-eraser" />
          </div>

          {hasCharacters ? (
            <div className="cm-room-chalkboard-stage" aria-hidden={false}>
              <div className="cm-room-chalkboard-stage-side is-left">
                {leftChars.map((c) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={c.id}
                    className="cm-room-chalkboard-character"
                    src={c.src}
                    alt={c.alt}
                    decoding="async"
                  />
                ))}
              </div>
              <div className="cm-room-chalkboard-stage-side is-center">
                {centerChars.map((c) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={c.id}
                    className="cm-room-chalkboard-character"
                    src={c.src}
                    alt={c.alt}
                    decoding="async"
                  />
                ))}
              </div>
              <div className="cm-room-chalkboard-stage-side is-right">
                {rightChars.map((c) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={c.id}
                    className="cm-room-chalkboard-character"
                    src={c.src}
                    alt={c.alt}
                    decoding="async"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <section className="cm-room-body" style={{ marginTop: 10, color: "#111" }}>
        {children}
      </section>
    </main>
  );
}
