"use client";

import Link from "next/link";
import React from "react";
import {
  RoomSessionHero,
  type RoomSessionStatusTone,
} from "@/components/room/RoomSessionHero";
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
  /** Category / world label shown under the title (e.g. フリークラス). */
  categoryLabel?: string;
  /** Member count label (e.g. 1/5人). */
  countLabel?: string;
  statusLabel?: string;
  statusTone?: RoomSessionStatusTone;
  /** @deprecated Prefer categoryLabel + countLabel. Kept for call sites. */
  subtitle?: string;
  lines?: string[];
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Horizontal avatar strip rendered inside the hero. */
  avatarStrip?: React.ReactNode;

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
  /**
   * Waiting-room board prominence.
   * compact (default): small secondary board; hidden: omit; full: legacy size.
   */
  boardMode?: "compact" | "hidden" | "full";
};

export function ChalkboardRoomShell({
  title,
  categoryLabel,
  countLabel,
  statusLabel,
  statusTone = "waiting",
  subtitle,
  lines = [],
  right,
  children,
  avatarStrip,
  onBack,
  backLabel = "戻る",
  onHome,
  homeLabel = "ホーム",
  homeHref: homeHrefProp,
  onStartCall,
  startDisabled = false,
  startLabel = "通話を開始",
  characters = [],
  boardMode = "compact",
}: Props) {
  const isApp = isAppShellContext();
  const subtitleText = String(subtitle ?? "").trim();
  const resolvedCategory =
    categoryLabel?.trim() ||
    (subtitleText.includes("/")
      ? subtitleText.split("/")[0]?.trim()
      : subtitleText && !subtitleText.includes("人")
        ? subtitleText
        : "");
  const resolvedCount =
    countLabel?.trim() ||
    (subtitleText.includes("/")
      ? subtitleText.split("/").slice(1).join("/").trim()
      : subtitleText.includes("人")
        ? subtitleText
        : "");
  const boardTitle = resolvedCategory
    ? `${title} (${resolvedCategory})`
    : title;

  const moveHref = withDev("/class/select");
  const homeHref = withDev(
    homeHrefProp ?? (isApp ? resolveShellDashboardPath() : "/")
  );
  const ghostBtnClass = [
    "cm-room-ghost-btn",
    "cm-room-session-hero-iconbtn",
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
    "cm-room-scope--hero-v2",
    isApp ? "app-immersive-inner app-immersive-inner--wide" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const leftChars = characters.filter((c) => (c.side ?? "left") === "left");
  const centerChars = characters.filter((c) => c.side === "center");
  const rightChars = characters.filter((c) => c.side === "right");
  const hasCharacters = characters.length > 0;
  const showBoard = boardMode !== "hidden";

  const toolbarLeft = onBack ? (
    <button
      type="button"
      onClick={onBack}
      className={ghostBtnClass}
      aria-label={backLabel}
    >
      ←
    </button>
  ) : (
    <Link href={homeHref} className={ghostBtnClass} aria-label={homeLabel}>
      ←
    </Link>
  );

  const toolbarRight = (
    <>
      <Link href={moveHref} className={ghostBtnClass}>
        移動
      </Link>
      {onHome ? (
        <button type="button" onClick={onHome} className={ghostBtnClass}>
          {homeLabel}
        </button>
      ) : (
        <Link href={homeHref} className={ghostBtnClass}>
          {homeLabel}
        </Link>
      )}
      {right}
    </>
  );

  const primaryAction = onStartCall ? (
    <button
      type="button"
      onClick={onStartCall}
      disabled={startDisabled}
      className={primaryBtnClass}
    >
      {startLabel}
    </button>
  ) : null;

  return (
    <main
      className={mainClass}
      style={
        isApp
          ? undefined
          : { padding: "0 0 28px", maxWidth: 980, margin: "0 auto" }
      }
    >
      <RoomSessionHero
        title={title}
        categoryLabel={resolvedCategory || undefined}
        countLabel={resolvedCount || undefined}
        statusLabel={statusLabel}
        statusTone={statusTone}
        primaryAction={primaryAction}
        avatarStrip={avatarStrip}
        toolbarLeft={toolbarLeft}
        toolbarRight={toolbarRight}
      />

      {showBoard ? (
        <div
          className={[
            "cm-room-board-wrap",
            boardMode === "compact" ? "cm-room-board-wrap--compact" : "",
            hasCharacters ? "has-characters" : "",
          ]
            .filter(Boolean)
            .join(" ")}
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
      ) : null}

      <section className="cm-room-body cm-room-body--hero-v2">{children}</section>
    </main>
  );
}
