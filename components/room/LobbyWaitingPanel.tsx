"use client";

/**
 * Alone-wait timeout actions for the waiting room.
 * Normal recruiting status lives in the hero chip / member count —
 * this panel only appears when the user must choose extend vs quit.
 */
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
  showTimeoutChoice,
  alreadyExtended,
  extendBusy,
  quitBusy,
  extendError,
  onExtend,
  onQuit,
}: Props) {
  if (!showTimeoutChoice) return null;

  const busy = extendBusy || quitBusy;

  return (
    <div className="cm-call-notice cm-call-notice--action" role="status">
      <div className="cm-call-notice-title">
        {alreadyExtended
          ? "まだ人が集まりません。今回はやめますか？"
          : "5分経っても集まりませんでした。どうしますか？"}
      </div>
      <div className="cm-call-notice-actions">
        {!alreadyExtended ? (
          <button
            type="button"
            className="cm-call-notice-btn cm-call-notice-btn--primary"
            disabled={busy}
            onClick={onExtend}
          >
            {extendBusy ? "延長中…" : "待機を続ける"}
          </button>
        ) : null}
        <button
          type="button"
          className="cm-call-notice-btn"
          disabled={busy}
          onClick={onQuit}
        >
          {quitBusy ? "退出中…" : "今回はやめる"}
        </button>
      </div>
      {extendError ? (
        <div className="cm-call-notice-body cm-call-notice-body--error">
          {extendError}
        </div>
      ) : null}
    </div>
  );
}
