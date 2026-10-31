"use client";

import Link from "next/link";
import { withDev } from "@/lib/withDev";

type MyClassEmptyProps = {
  className?: string;
  onRandomFocus?: () => void;
};

/**
 * Compact empty state. Random talk is the priority cue, but the large CTA
 * lives only in RandomTalkCta — this just points there.
 */
export function MyClassEmpty({ className, onRandomFocus }: MyClassEmptyProps) {
  return (
    <div
      className={["cm-my-class-empty", "cm-my-class-empty--compact", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="cm-my-class-empty-row">
        <div className="cm-my-class-empty-visual" aria-hidden>
          <span className="cm-my-class-empty-orb cm-my-class-empty-orb--a" />
          <span className="cm-my-class-empty-orb cm-my-class-empty-orb--b" />
          <span className="cm-my-class-empty-mark" />
        </div>
        <div className="cm-my-class-empty-copy">
          <p className="cm-empty-state-title">最初のクラスを見つけよう</p>
          <p className="cm-empty-state-body">下のランダム通話から始められます</p>
        </div>
      </div>
      <div className="cm-my-class-empty-actions">
        {onRandomFocus ? (
          <button
            type="button"
            className="cm-home-discover-link"
            onClick={onRandomFocus}
          >
            ランダム通話へ
          </button>
        ) : (
          <Link
            href={withDev("/#cm-home-random")}
            className="cm-home-discover-link"
          >
            ランダム通話へ
          </Link>
        )}
        <Link href={withDev("/class/select")} className="cm-text-btn">
          探す
        </Link>
        <Link href={withDev("/class/create")} className="cm-text-btn">
          作る
        </Link>
      </div>
    </div>
  );
}
