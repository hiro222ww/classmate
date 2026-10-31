"use client";

import type { ReactNode } from "react";
import { HOME_INTRO } from "@/lib/seo";
import { CmAppHeader } from "@/components/brand/CmAppHeader";

type Props = {
  menuButton?: ReactNode;
  showIntro?: boolean;
};

/**
 * Shared brand header used across web pages.
 * Delegates to CmAppHeader so size/spacing match home.
 */
export function HomeBrandVisual({ menuButton, showIntro = true }: Props) {
  const tagline = showIntro
    ? HOME_INTRO.length > 28
      ? `${HOME_INTRO.slice(0, 26).trimEnd()}…`
      : HOME_INTRO
    : null;

  return (
    <CmAppHeader
      tagline={tagline}
      hideWebPush
      trailing={menuButton}
      className="cm-home-brand-visual cm-stagger-1"
    />
  );
}
