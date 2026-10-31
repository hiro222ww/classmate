"use client";

import { useEffect, useMemo, useState } from "react";
import {
  THEME_MAJOR_CATEGORIES,
  hydrateThemeCatalog,
  listFeaturedHomeMajorCategories,
  listVisibleThemeMajorCategories,
  type ThemeMajorCategoryDef,
  type ThemeMajorCategoryDto,
} from "@/lib/themeCatalog";

type CatalogState = {
  majors: ThemeMajorCategoryDef[];
  source: "database" | "fallback" | "static";
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useThemeCatalog(): CatalogState {
  const [majors, setMajors] = useState<ThemeMajorCategoryDef[]>(() => [
    ...THEME_MAJOR_CATEGORIES,
  ]);
  const [source, setSource] = useState<"database" | "fallback" | "static">(
    "static"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/theme-catalog", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json?.ok || !Array.isArray(json.majors)) {
          throw new Error(json?.error ?? "theme_catalog_failed");
        }
        const hydrated = hydrateThemeCatalog(
          json.majors as ThemeMajorCategoryDto[]
        );
        setMajors(hydrated);
        setSource(json.source === "database" ? "database" : "fallback");
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message ?? e));
        setMajors([...THEME_MAJOR_CATEGORIES]);
        setSource("static");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    majors,
    source,
    loading,
    error,
    reload: () => setTick((n) => n + 1),
  };
}

export function useVisibleThemeMajors() {
  const catalog = useThemeCatalog();
  const visible = useMemo(
    () => listVisibleThemeMajorCategories(catalog.majors),
    [catalog.majors]
  );
  return { ...catalog, majors: visible };
}

export function useFeaturedThemeMajors() {
  const catalog = useThemeCatalog();
  const featured = useMemo(
    () => listFeaturedHomeMajorCategories(catalog.majors),
    [catalog.majors]
  );
  return { ...catalog, majors: featured };
}
