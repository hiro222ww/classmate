"use client";

import { HOME_INTRO } from "@/lib/seo";
import {
  CmAppHeader,
  type CmAppHeaderProps,
} from "@/components/brand/CmAppHeader";

type HomeHeaderProps = Omit<CmAppHeaderProps, "tagline" | "hideWebPush"> & {
  intro?: string;
  hideWebPush?: boolean;
};

/**
 * Home-specific wrapper around the shared compact app header.
 */
export function HomeHeader({
  intro = HOME_INTRO,
  hideWebPush = false,
  ...rest
}: HomeHeaderProps) {
  const tagline =
    intro.length > 28 ? `${intro.slice(0, 26).trimEnd()}…` : intro;

  return (
    <CmAppHeader
      {...rest}
      tagline={tagline}
      hideWebPush={hideWebPush}
      className={["cm-home-header", "cm-stagger-1", rest.className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
