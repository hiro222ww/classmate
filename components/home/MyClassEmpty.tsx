"use client";

import { DefaultAvatarMark } from "@/components/ui/DefaultAvatarMark";

type MyClassEmptyProps = {
  className?: string;
  /** When true, copy mentions creating a class. Hidden while unknown. */
  canCreateClasses?: boolean;
};

/**
 * Compact empty preview for マイクラス.
 * Discover / create / random CTAs live elsewhere on home (no duplicate buttons).
 */
export function MyClassEmpty({
  className,
  canCreateClasses = false,
}: MyClassEmptyProps) {
  return (
    <div
      className={["cm-my-class-empty", className].filter(Boolean).join(" ")}
    >
      <div className="cm-my-class-empty-visual" aria-hidden>
        <DefaultAvatarMark className="cm-my-class-empty-mark" />
      </div>
      <p className="cm-empty-state-title">まだ参加しているクラスはありません</p>
      <p className="cm-empty-state-body">
        {canCreateClasses
          ? "気になるクラスに参加したり、自分でクラスを作ってみよう。"
          : "気になるテーマからクラスを探して参加してみよう。"}
      </p>
    </div>
  );
}
