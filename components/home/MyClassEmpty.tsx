"use client";

type MyClassEmptyProps = {
  className?: string;
};

/**
 * Warm empty preview for マイクラス.
 * Discover / create / random CTAs live elsewhere on home (no duplicate buttons).
 */
export function MyClassEmpty({ className }: MyClassEmptyProps) {
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
      <p className="cm-empty-state-body">
        下のカテゴリーやランダム通話から、気軽に始められます
      </p>
    </div>
  );
}
