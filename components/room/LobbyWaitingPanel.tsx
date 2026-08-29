"use client";

import { RECRUIT_SOFT_CLOSE_AT_MEMBERS } from "@/lib/autoCallOnce";

type Props = {
  memberCount: number;
  elapsedLabel: string;
  showTimeoutChoice: boolean;
  alreadyExtended: boolean;
  extendBusy: boolean;
  quitBusy: boolean;
  extendError: string | null;
  onExtend: () => void;
  onQuit: () => void;
};

export function LobbyWaitingPanel({
  memberCount,
  elapsedLabel,
  showTimeoutChoice,
  alreadyExtended,
  extendBusy,
  quitBusy,
  extendError,
  onExtend,
  onQuit,
}: Props) {
  const busy = extendBusy || quitBusy;
  const count = Math.max(0, memberCount);

  return (
    <div
      className="cm-paper-card cm-room-lobby-wait"
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 14,
        background: "#fffbeb",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15, color: "#92400e" }}>
        メンバーを待っています
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#78350f" }}>
        現在 {count} / {RECRUIT_SOFT_CLOSE_AT_MEMBERS} 人
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#a16207" }}>
        通話画面で募集を続けています
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#78716c" }}>
        待機時間 {elapsedLabel}
      </div>

      {showTimeoutChoice ? (
        <div
          style={{
            marginTop: 4,
            display: "grid",
            gap: 10,
            paddingTop: 10,
            borderTop: "1px solid #fde68a",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "#78350f" }}>
            {alreadyExtended
              ? "まだ人が集まりません。今回はやめますか？"
              : "5分経っても集まりませんでした。どうしますか？"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {!alreadyExtended ? (
              <button
                type="button"
                disabled={busy}
                onClick={onExtend}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {extendBusy ? "延長中…" : "待機を続ける"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={onQuit}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#374151",
                fontWeight: 900,
                fontSize: 13,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {quitBusy ? "退出中…" : "今回はやめる"}
            </button>
          </div>
          {extendError ? (
            <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>
              {extendError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
