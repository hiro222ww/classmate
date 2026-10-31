"use client";

import type { ReactNode } from "react";
import { CmAppHeader } from "@/components/brand/CmAppHeader";

type Props = {
  menuButton?: ReactNode;
  /** @deprecated Ignored — headers stay compact and consistent. */
  showIntro?: boolean;
};

/**
 * Shared brand header — identical size/spacing to home (kana only, no long copy).
 */
export function HomeBrandVisual({ menuButton }: Props) {
  return (
    <CmAppHeader
      tagline={null}
      hideWebPush
      trailing={menuButton}
      className="cm-home-brand-visual cm-stagger-1"
    />
  );
}
