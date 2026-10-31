"use client";

import Link from "next/link";
import { withDev } from "@/lib/withDev";

type MyClassEmptyProps = {
  className?: string;
  onRandomFocus?: () => void;
};

/** Attractive empty state — primary action is random talk. */
export function MyClassEmpty({ className, onRandomFocus }: MyClassEmptyProps) {
  return (
    <div
      className={["cm-my-class-empty", className].filter(Boolean).join(" ")}
    >
      <div className="cm-my-class-empty-visual" aria-hidden>
        <span className="cm-my-class-empty-orb cm-my-class-empty-orb--a" />
        <span className="cm-my-class-empty-orb cm-my-class-empty-orb--b" />
        <span className="cm-my-class-empty-orb cm-my-class-empty-orb--c" />
        <span className="cm-my-class-empty-mark" />
      </div>
      <p className="cm-empty-state-title">最初のクラスを見つけよう</p>
      <p className="cm-empty-state-body">ランダム通話から気軽に始められます</p>
      <div className="cm-my-class-empty-actions">
        {onRandomFocus ? (
          <button
            type="button"
            className="cm-my-class-empty-primary"
            onClick={onRandomFocus}
          >
            ランダム通話
          </button>
        ) : (
          <Link href={withDev("/#cm-home-random")} className="cm-my-class-empty-primary">
            ランダム通話
          </Link>
        )}
        <Link href={withDev("/class/select")} className="cm-home-discover-link">
          探す
        </Link>
        <Link href={withDev("/class/create")} className="cm-text-btn">
          作る
        </Link>
      </div>
    </div>
  );
}
