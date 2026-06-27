"use client";

import { useState } from "react";

type Props = {
  enabled: boolean;
  busy?: boolean;
  feedback?: string | null;
  onToggle: () => void | Promise<void>;
};

export function PushNotificationBell({
  enabled,
  busy = false,
  feedback = null,
  onToggle,
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
          enabled ? "classmate-push-bell--on" : "classmate-push-bell--off",
          wiggle ? "classmate-push-bell--wiggle" : "",
          busy ? "classmate-push-bell--busy" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="classmate-push-bell-icon" aria-hidden>
          {enabled ? "🔔" : "🔕"}
        </span>
        <span className="classmate-push-bell-label">
          {busy ? (settingUp ? "設定中" : "…") : enabled ? "ON" : "OFF"}
        </span>
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
