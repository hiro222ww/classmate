"use client";

import { JoinNewCard } from "@/components/dashboard/JoinNewCard";
import type { ComponentProps } from "react";

type RandomTalkCtaProps = ComponentProps<typeof JoinNewCard> & {
  heading?: string;
  description?: string;
};

/**
 * High-visibility wrapper around the existing voice/chat match CTAs.
 * Logic stays in JoinNewCard / MatchEntryButton.
 */
export function RandomTalkCta({
  heading = "ランダム通話",
  description = "同年代と今すぐ話そう。通話かチャットを選べます。",
  className,
  ...joinProps
}: RandomTalkCtaProps) {
  return (
    <section className={["cm-random-talk", className].filter(Boolean).join(" ")}>
      <div className="cm-random-talk-copy">
        <h2 className="cm-random-talk-heading">{heading}</h2>
        <p className="cm-random-talk-desc">{description}</p>
      </div>
      <JoinNewCard className="cm-random-talk-card home-dash-join" {...joinProps} />
    </section>
  );
}
