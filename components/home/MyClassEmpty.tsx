"use client";

type MyClassEmptyProps = {
  className?: string;
};

/**
 * Compact empty preview for マイクラス.
 * Discover / create / random CTAs live outside this block.
 */
export function MyClassEmpty({ className }: MyClassEmptyProps) {
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
          <p className="cm-empty-state-title">まだ所属クラスはありません</p>
          <p className="cm-empty-state-body">
            下のカテゴリーやランダム通話から始められます
          </p>
        </div>
      </div>
    </div>
  );
}
