"use client";

import { HelpTip } from "@/components/HelpTip";
import { DASH_CARD, PRIMARY_BTN, SECONDARY_BTN } from "@/components/dashboard/dashboardStyles";

const JOIN_NEW_HELP_TEXT =
  "別のクラスへ新規参加する導線です。すでに所属中のクラスに戻る場合は「今のクラスに戻る」を使ってください。";

type JoinNewCardProps = {
  className?: string;
  quickJoinDisabled?: boolean;
  quickJoinBusy?: boolean;
  pickPlaceLabel?: string;
  onQuickJoin: () => void;
  onPickPlace: () => void;
};

export function JoinNewCard({
  className,
  quickJoinDisabled = false,
  quickJoinBusy = false,
  pickPlaceLabel = "入る場所を選ぶ",
  onQuickJoin,
  onPickPlace,
}: JoinNewCardProps) {
  return (
    <section className={className} style={DASH_CARD}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 12,
        }}
      >
        <strong style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>
          新しく参加する
        </strong>
        <HelpTip label="新しく参加するについて" content={JOIN_NEW_HELP_TEXT} />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <button
          type="button"
          onClick={onQuickJoin}
          disabled={quickJoinDisabled || quickJoinBusy}
          style={{
            ...PRIMARY_BTN,
            opacity: quickJoinDisabled || quickJoinBusy ? 0.55 : 1,
            cursor: quickJoinDisabled || quickJoinBusy ? "not-allowed" : "pointer",
          }}
        >
          {quickJoinBusy ? "参加中…" : "今すぐ入る"}
        </button>

        <button
          type="button"
          onClick={onPickPlace}
          style={SECONDARY_BTN}
        >
          {pickPlaceLabel}
        </button>
      </div>
    </section>
  );
}
