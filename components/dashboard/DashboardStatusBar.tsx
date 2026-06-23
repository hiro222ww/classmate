"use client";

import { HelpTip } from "@/components/HelpTip";
import { CHIP } from "@/components/dashboard/dashboardStyles";

const ADMISSION_WINDOW_HELP_TEXT =
  "新規入校は受付時間内のみ可能です。所属中のクラスへの再入室はいつでもできます。";

const PLAN_HELP_TEXT =
  "テーマプランの料金や変更は「プランを見る」から確認できます。";

type DashboardStatusBarProps = {
  slots: number;
  planLabel: string;
  joinWindowOpen: boolean;
  joinWindowText?: string;
  loading?: boolean;
  onReload?: () => void;
};

export function DashboardStatusBar({
  slots,
  planLabel,
  joinWindowOpen,
  joinWindowText,
  loading = false,
  onReload,
}: DashboardStatusBarProps) {
  return (
    <section
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span style={CHIP}>クラス枠: {slots}</span>

      <HelpTip label="テーマプランについて" content={PLAN_HELP_TEXT}>
        <span style={CHIP}>テーマプラン: {planLabel}</span>
      </HelpTip>

      {joinWindowOpen ? (
        <span style={CHIP}>
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "#22c55e",
              display: "inline-block",
            }}
          />
          {joinWindowText?.includes("入校") ? joinWindowText : "入校受付中"}
        </span>
      ) : (
        <HelpTip label="入校受付時間について" content={ADMISSION_WINDOW_HELP_TEXT}>
          <span style={CHIP}>受付時間外</span>
        </HelpTip>
      )}

      {onReload ? (
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          aria-label="再読み込み"
          title="再読み込み"
          style={{
            marginLeft: "auto",
            padding: "5px 9px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#9ca3af",
            fontWeight: 800,
            fontSize: 12,
            lineHeight: 1,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          ↻
        </button>
      ) : null}
    </section>
  );
}
