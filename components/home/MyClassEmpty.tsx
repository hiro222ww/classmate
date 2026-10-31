"use client";

import Link from "next/link";
import { withDev } from "@/lib/withDev";

type MyClassEmptyProps = {
  className?: string;
  onRandomFocus?: () => void;
};

/** Attractive empty state — real routes only, no invented classes. */
export function MyClassEmpty({ className, onRandomFocus }: MyClassEmptyProps) {
  return (
    <div
      className={["cm-my-class-empty", className].filter(Boolean).join(" ")}
    >
      <div className="cm-my-class-empty-visual" aria-hidden>
        <span className="cm-my-class-empty-orb cm-my-class-empty-orb--a" />
        <span className="cm-my-class-empty-orb cm-my-class-empty-orb--b" />
        <span className="cm-my-class-empty-mark" />
      </div>
      <p className="cm-empty-state-title">まだクラスがありません</p>
      <p className="cm-empty-state-body">探すか、ランダム通話から始められます</p>
      <div className="cm-empty-state-actions">
        <Link href={withDev("/class/select")} className="cm-home-discover-link">
          探す
        </Link>
        <Link href={withDev("/class/create")} className="cm-text-btn">
          作る
        </Link>
        {onRandomFocus ? (
          <button
            type="button"
            className="cm-text-btn"
            onClick={onRandomFocus}
          >
            ランダム通話
          </button>
        ) : (
          <a href="#cm-home-random" className="cm-text-btn">
            ランダム通話
          </a>
        )}
      </div>
    </div>
  );
}
