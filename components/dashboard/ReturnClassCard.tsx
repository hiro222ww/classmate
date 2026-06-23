"use client";

import { HelpTip } from "@/components/HelpTip";
import { DASH_CARD, PRIMARY_BTN } from "@/components/dashboard/dashboardStyles";

const RETURN_CLASS_HELP_TEXT =
  "所属中のクラスに戻れます。入校受付時間外でも、すでに所属しているクラスには入れます。";

type ReturnClassCardProps = {
  className?: string;
  loading?: boolean;
  opening?: boolean;
  onOpen: () => void;
};

export function ReturnClassCard({
  className,
  loading = false,
  opening = false,
  onOpen,
}: ReturnClassCardProps) {
  if (loading) {
    return (
      <section className={className} style={DASH_CARD} aria-busy="true">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 140,
              height: 18,
              borderRadius: 8,
              background: "#f3f4f6",
            }}
          />
        </div>
        <div
          style={{
            width: "100%",
            height: 44,
            borderRadius: 12,
            background: "#f3f4f6",
          }}
        />
      </section>
    );
  }

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
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 900,
            color: "#111827",
            lineHeight: 1.3,
          }}
        >
          今のクラスに戻る
        </h2>
        <HelpTip
          label="今のクラスに戻るについて"
          content={RETURN_CLASS_HELP_TEXT}
        />
      </div>

      <button
        type="button"
        onClick={onOpen}
        disabled={opening}
        style={{
          ...PRIMARY_BTN,
          opacity: opening ? 0.75 : 1,
          cursor: opening ? "default" : "pointer",
        }}
      >
        {opening ? "入っています…" : "今のクラスを見る"}
      </button>
    </section>
  );
}
