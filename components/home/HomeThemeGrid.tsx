"use client";

import { ThemeCardGrid } from "@/components/home/themeCards";

type HomeThemeGridProps = {
  className?: string;
  title?: string;
};

/** Home discover section — links into /class/select. */
export function HomeThemeGrid({
  className,
  title = "探す",
}: HomeThemeGridProps) {
  return (
    <ThemeCardGrid
      className={className}
      title={title}
      href="/class/select"
      listHref="/class/select"
    />
  );
}
