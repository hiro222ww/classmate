"use client";

import { ThemeCardGrid } from "@/components/home/themeCards";
import { useFeaturedThemeMajors } from "@/hooks/useThemeCatalog";

type HomeThemeGridProps = {
  className?: string;
  title?: string;
};

/** Home discover section — representative majors only; すべて見る opens full catalog. */
export function HomeThemeGrid({
  className,
  title = "探す",
}: HomeThemeGridProps) {
  const { majors } = useFeaturedThemeMajors();

  return (
    <ThemeCardGrid
      className={className}
      title={title}
      variant="featured"
      categories={majors}
      listHref="/class/select"
      listLabel="すべて見る"
    />
  );
}
