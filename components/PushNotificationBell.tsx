"use client";

import { useState } from "react";

type Props = {
  enabled: boolean;
  busy?: boolean;
  feedback?: string | null;
  onToggle: () => void | Promise<void>;
  /** Icon-only control for compact app headers (keeps 44px tap target). */
  compact?: boolean;
};

export function PushNotificationBell({
  enabled,
  busy = false,
  feedback = null,
  onToggle,
  compact = false,
}: Props) {
  const [wiggle, setWiggle] = useState(false);

  async function handleClick() {
    if (busy) return;
    setWiggle(true);
    window.setTimeout(() => setWiggle(false), 650);
    await onToggle();
  }

  const showFeedback = Boolean(feedback);
  const settingUp = busy && !enabled && feedback === "通知を設定しています…";

  return (
    <div
      className="classmate-push-bell-wrap"
      style={{ position: "relative", flexShrink: 0 }}
    >
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        title={
          enabled
            ? "プッシュ通知をオフにする"
            : "プッシュ通知をオンにする"
        }
        aria-label={
          enabled
            ? "プッシュ通知をオフにする"
            : "プッシュ通知をオンにする"
        }
        aria-pressed={enabled}
        aria-busy={busy}
        className={[
          "classmate-push-bell",
          compact ? "classmate-push-bell--compact" : "",
          enabled ? "classmate-push-bell--on" : "classmate-push-bell--off",
          wiggle ? "classmate-push-bell--wiggle" : "",
          busy ? "classmate-push-bell--busy" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="classmate-push-bell-icon" aria-hidden>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            {!enabled ? <path d="M2 2l20 20" strokeOpacity="0.45" /> : null}
          </svg>
        </span>
        {!compact ? (
          <span className="classmate-push-bell-label">
            {busy ? (settingUp ? "設定中" : "…") : enabled ? "ON" : "OFF"}
          </span>
        ) : null}
        {compact && !enabled ? (
          <span className="classmate-push-bell-dot" aria-hidden />
        ) : null}
      </button>

      {showFeedback ? (
        <div
          className={[
            "classmate-push-bell-toast",
            enabled ? "classmate-push-bell-toast--on" : "",
            settingUp ? "classmate-push-bell-toast--busy" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="status"
          aria-live="polite"
        >
          {feedback}
        </div>
      ) : null}
    </div>
  );
}
