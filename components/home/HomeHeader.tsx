"use client";

import {
  CmAppHeader,
  type CmAppHeaderProps,
} from "@/components/brand/CmAppHeader";

type HomeHeaderProps = Omit<CmAppHeaderProps, "tagline" | "hideWebPush"> & {
  hideWebPush?: boolean;
  /** Overlay on the photo hero (no white card). */
  variant?: "card" | "onHero";
};

/**
 * Home header — card (other pages) or transparent overlay on the photo hero.
 */
export function HomeHeader({
  // Bell lives in the profile menu — never duplicate it in the hero header.
  hideWebPush = true,
  variant = "card",
  ...rest
}: HomeHeaderProps) {
  const onHero = variant === "onHero";
  return (
    <CmAppHeader
      {...rest}
      tagline={null}
      hideWebPush={hideWebPush}
      className={[
        "cm-home-header",
        onHero ? "cm-home-header--on-hero" : "cm-stagger-1",
        rest.className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
