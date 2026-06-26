"use client";

import Link from "next/link";
import { HelpTip } from "@/components/HelpTip";
import {
  CLASS_ENTER_BTN,
  DASH_CARD,
  SECONDARY_BTN,
} from "@/components/dashboard/dashboardStyles";

const RETURN_CLASS_HELP_TEXT =
  "すでに所属しているクラスに戻れます。入校受付時間外でも入室できます。";

type ReturnClassCardProps = {
  className?: string;
  loading?: boolean;
  opening?: boolean;
  canEnterCurrent?: boolean;
  onEnterCurrent?: () => void;
  listHref?: string;
  listLabel?: string;
};

export function ReturnClassCard({
  className,
  loading = false,
  opening = false,
  canEnterCurrent = false,
  onEnterCurrent,
  listHref,
  listLabel = "所属クラス一覧へ",
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
              width: 100,
              height: 18,
              borderRadius: 8,
              background: "#f3f4f6",
            }}
          />
        </div>
        <div
          style={{
            width: 140,
            height: 40,
            borderRadius: 10,
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
          所属クラス
        </h2>
        <HelpTip label="所属クラスについて" content={RETURN_CLASS_HELP_TEXT} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canEnterCurrent && onEnterCurrent ? (
          <button
            type="button"
            onClick={onEnterCurrent}
            disabled={opening}
            style={{
              ...CLASS_ENTER_BTN,
              opacity: opening ? 0.75 : 1,
              cursor: opening ? "default" : "pointer",
            }}
          >
            {opening ? "入室中…" : "入室する"}
          </button>
        ) : null}

        {listHref ? (
          <Link
            href={listHref}
            style={{
              ...SECONDARY_BTN,
              width: "auto",
              minWidth: 108,
              textAlign: "center",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {listLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
