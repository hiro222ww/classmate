"use client";

import { ThemeCardGrid } from "@/components/home/themeCards";

type HomeThemeGridProps = {
  className?: string;
  title?: string;
};

/** Home discover section — representative majors only; 一覧 opens full catalog. */
export function HomeThemeGrid({
  className,
  title = "探す",
}: HomeThemeGridProps) {
  return (
    <ThemeCardGrid
      className={className}
      title={title}
      variant="featured"
      listHref="/class/select"
    />
  );
}
