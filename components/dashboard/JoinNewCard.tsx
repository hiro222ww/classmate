"use client";

import { HelpTip } from "@/components/HelpTip";
import { DASH_CARD, PRIMARY_BTN, SECONDARY_BTN } from "@/components/dashboard/dashboardStyles";

const JOIN_NEW_HELP_TEXT =
  "別のクラスへ新規参加する導線です。すでに所属中のクラスに戻る場合は「所属クラス」から選んでください。";

type JoinNewCardProps = {
  className?: string;
  quickJoinDisabled?: boolean;
  quickJoinBusy?: boolean;
  quickJoinLabel?: string;
  quickJoinHint?: string;
  pickPlaceLabel?: string;
  onQuickJoin: () => void;
  onPickPlace: () => void;
};

export function JoinNewCard({
  className,
  quickJoinDisabled = false,
  quickJoinBusy = false,
  quickJoinLabel = "最大5人で話す",
  quickJoinHint = "3人集まると通話開始",
  pickPlaceLabel = "入る場所を選ぶ",
  onQuickJoin,
  onPickPlace,
}: JoinNewCardProps) {
  const sectionClass = ["cm-paper-card", className].filter(Boolean).join(" ");

  return (
    <section className={sectionClass} style={DASH_CARD}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
        }}
      >
        <strong
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: "#111827",
            letterSpacing: "0.01em",
          }}
        >
          新しく参加する
        </strong>
        <HelpTip label="新しく参加するについて" content={JOIN_NEW_HELP_TEXT} />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <button
          type="button"
          className="cm-cta-primary"
          onClick={onQuickJoin}
          disabled={quickJoinDisabled || quickJoinBusy}
          style={{
            ...PRIMARY_BTN,
            opacity: quickJoinDisabled || quickJoinBusy ? 0.55 : 1,
            cursor: quickJoinDisabled || quickJoinBusy ? "not-allowed" : "pointer",
          }}
        >
          {quickJoinBusy ? "参加中…" : quickJoinLabel}
        </button>
        {quickJoinHint ? (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              color: "#6b7280",
              textAlign: "center",
            }}
          >
            {quickJoinHint}
          </p>
        ) : null}

        <button
          type="button"
          className="cm-cta-secondary"
          onClick={onPickPlace}
          style={SECONDARY_BTN}
        >
          {pickPlaceLabel}
        </button>
      </div>
    </section>
  );
}
