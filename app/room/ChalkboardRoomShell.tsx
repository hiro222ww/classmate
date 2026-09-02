"use client";

import Link from "next/link";
import React from "react";
import { isAppShellContext, resolveShellDashboardPath } from "@/lib/appShellContext";
import { withDev } from "@/lib/withDev";

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

      <div className="cm-room-board-wrap" style={{ marginTop: 8 }}>
        <div
          className={
            isApp
              ? "app-immersive-board cm-room-chalkboard"
              : "cm-room-chalkboard"
          }
          style={
            isApp
              ? undefined
              : {
                  borderRadius: 18,
                  padding: "14px 18px",
                  background: "#0f2b1d",
                  color: "#e9fff2",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                  width: "100%",
                }
          }
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              className={
                isApp
                  ? "app-immersive-board-title cm-room-board-title"
                  : "cm-room-board-title"
              }
              style={
                isApp
                  ? undefined
                  : {
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: 0.2,
                      lineHeight: 1.3,
                    }
              }
            >
              {boardTitle}
            </div>

            {!isApp ? (
              <div className="cm-room-board-label" style={{ fontSize: 11, opacity: 0.8 }}>
                board
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {lines.map((t, i) => (
              <div
                key={i}
                className="cm-room-board-line"
                style={{
                  fontSize: 15,
                  lineHeight: 1.45,
                  fontWeight: 800,
                  opacity: 0.96,
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="cm-room-body" style={{ marginTop: 10, color: "#111" }}>
        {children}
      </section>
    </main>
  );
}
