"use client";

import { DefaultAvatarMark } from "@/components/ui/DefaultAvatarMark";

type MyClassEmptyProps = {
  className?: string;
};

/**
 * Compact empty preview for マイクラス.
 * Discover / create / random CTAs live elsewhere on home (no duplicate buttons).
 */
export function MyClassEmpty({ className }: MyClassEmptyProps) {
  return (
    <div
      className={["cm-my-class-empty", className].filter(Boolean).join(" ")}
    >
      <div className="cm-my-class-empty-visual" aria-hidden>
        <DefaultAvatarMark className="cm-my-class-empty-mark" />
      </div>
      <p className="cm-empty-state-title">まだ参加しているクラスはありません</p>
      <p className="cm-empty-state-body">
        気になるテーマから参加したり、自分でクラスを作ってみよう。
      </p>
    </div>
  );
}
