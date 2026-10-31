"use client";

import {
  CmAppHeader,
  type CmAppHeaderProps,
} from "@/components/brand/CmAppHeader";

type HomeHeaderProps = Omit<CmAppHeaderProps, "tagline" | "hideWebPush"> & {
  hideWebPush?: boolean;
};

/**
 * Home header — same compact chrome as mine/select (no long intro under logo).
 */
export function HomeHeader({
  hideWebPush = false,
  ...rest
}: HomeHeaderProps) {
  return (
    <CmAppHeader
      {...rest}
      tagline={null}
      hideWebPush={hideWebPush}
      className={["cm-home-header", "cm-stagger-1", rest.className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
