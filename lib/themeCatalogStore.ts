import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  FEATURED_HOME_MAJOR_LIMIT,
  THEME_MAJOR_CATEGORIES,
  hydrateThemeCatalog,
  isThemeOfferStatus,
  serializeThemeCatalog,
  type ThemeMajorCategoryDef,
  type ThemeMajorCategoryDto,
  type ThemeOfferStatus,
  type ThemeSubCategoryDto,
} from "@/lib/themeCatalog";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  "";

type MajorRow = {
  id: string;
  label: string;
  hint: string | null;
  description: string | null;
  icon_key: string | null;
  tone: string | null;
  tint: string | null;
  border: string | null;
  status: string | null;
  featured_on_home: boolean | null;
  display_order: number | null;
  orphan_match_pattern: string | null;
};

type SubRow = {
  id: string;
  major_id: string;
  label: string;
  hint: string | null;
  topic_keys: string[] | null;
  match_pattern: string | null;
  status: string | null;
  display_order: number | null;
};

function getServiceClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

function toMajorDto(row: MajorRow, children: ThemeSubCategoryDto[]): ThemeMajorCategoryDto {
  const status: ThemeOfferStatus = isThemeOfferStatus(row.status)
    ? row.status
    : "coming_soon";
  return {
    id: row.id,
    label: row.label,
    hint: row.hint ?? "",
    description: row.description ?? "",
    iconKey: row.icon_key || row.tone || row.id,
    tone: row.tone || row.id,
    tint: row.tint ?? "",
    border: row.border ?? "",
    status,
    featuredOnHome: Boolean(row.featured_on_home),
    order: Number(row.display_order) || 0,
    orphanMatchPattern: row.orphan_match_pattern,
    children,
  };
}

function toSubDto(row: SubRow): ThemeSubCategoryDto {
  const status = isThemeOfferStatus(row.status) ? row.status : null;
  return {
    id: row.id,
    label: row.label,
    topicKeys: Array.isArray(row.topic_keys) ? row.topic_keys.map(String) : [],
    matchPattern: row.match_pattern,
    hint: row.hint,
    status,
    order: Number(row.display_order) || 0,
  };
}

export function defaultThemeCatalogDtos(): ThemeMajorCategoryDto[] {
  return serializeThemeCatalog(THEME_MAJOR_CATEGORIES);
}

export function defaultThemeCatalogDefs(): ThemeMajorCategoryDef[] {
  return hydrateThemeCatalog(defaultThemeCatalogDtos());
}

/** Load catalog from DB; falls back to static seed when tables are missing/empty. */
export async function loadThemeCatalogDtos(options?: {
  includeHidden?: boolean;
}): Promise<{
  majors: ThemeMajorCategoryDto[];
  source: "database" | "fallback";
}> {
  const sb = getServiceClient();
  if (!sb) {
    return { majors: defaultThemeCatalogDtos(), source: "fallback" };
  }

  try {
    const { data: majorRows, error: majorError } = await sb
      .from("theme_major_categories")
      .select(
        "id,label,hint,description,icon_key,tone,tint,border,status,featured_on_home,display_order,orphan_match_pattern"
      )
      .order("display_order", { ascending: true })
      .order("id", { ascending: true });

    if (majorError || !majorRows || majorRows.length === 0) {
      return { majors: defaultThemeCatalogDtos(), source: "fallback" };
    }

    const { data: subRows, error: subError } = await sb
      .from("theme_sub_categories")
      .select(
        "id,major_id,label,hint,topic_keys,match_pattern,status,display_order"
      )
      .order("display_order", { ascending: true })
      .order("id", { ascending: true });

    if (subError) {
      return { majors: defaultThemeCatalogDtos(), source: "fallback" };
    }

    const byMajor = new Map<string, ThemeSubCategoryDto[]>();
    for (const row of (subRows ?? []) as SubRow[]) {
      const list = byMajor.get(row.major_id) ?? [];
      list.push(toSubDto(row));
      byMajor.set(row.major_id, list);
    }

    let majors = (majorRows as MajorRow[]).map((row) =>
      toMajorDto(row, byMajor.get(row.id) ?? [])
    );

    if (!options?.includeHidden) {
      majors = majors.filter((m) => m.status !== "hidden");
    }

    return { majors, source: "database" };
  } catch {
    return { majors: defaultThemeCatalogDtos(), source: "fallback" };
  }
}

export async function loadThemeCatalogDefs(options?: {
  includeHidden?: boolean;
}): Promise<{
  majors: ThemeMajorCategoryDef[];
  source: "database" | "fallback";
}> {
  const loaded = await loadThemeCatalogDtos(options);
  return {
    majors: hydrateThemeCatalog(loaded.majors),
    source: loaded.source,
  };
}

function normalizeStatus(value: unknown, fallback: ThemeOfferStatus): ThemeOfferStatus {
  return isThemeOfferStatus(value) ? value : fallback;
}

function normalizeTopicKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

/** Enforce at most FEATURED_HOME_MAJOR_LIMIT featured majors. */
export function clampFeaturedFlags(
  majors: ThemeMajorCategoryDto[]
): ThemeMajorCategoryDto[] {
  let featured = 0;
  return majors.map((major) => {
    if (!major.featuredOnHome) return major;
    if (featured >= FEATURED_HOME_MAJOR_LIMIT) {
      return { ...major, featuredOnHome: false };
    }
    featured += 1;
    return major;
  });
}

export async function replaceThemeCatalog(
  majorsInput: ThemeMajorCategoryDto[]
): Promise<{ majors: ThemeMajorCategoryDto[] }> {
  const sb = getServiceClient();
  if (!sb) throw new Error("supabase_not_configured");

  const majors = clampFeaturedFlags(
    majorsInput.map((major) => ({
      ...major,
      id: String(major.id ?? "").trim(),
      label: String(major.label ?? "").trim(),
      hint: String(major.hint ?? "").trim(),
      description: String(major.description ?? ""),
      iconKey: String(major.iconKey ?? major.tone ?? major.id).trim() || "chat",
      tone: String(major.tone ?? major.id).trim() || "chat",
      tint: String(major.tint ?? ""),
      border: String(major.border ?? ""),
      status: normalizeStatus(major.status, "coming_soon"),
      featuredOnHome: Boolean(major.featuredOnHome),
      order: Number(major.order) || 0,
      orphanMatchPattern: major.orphanMatchPattern
        ? String(major.orphanMatchPattern)
        : null,
      children: (major.children ?? []).map((child) => ({
        id: String(child.id ?? "").trim(),
        label: String(child.label ?? "").trim(),
        topicKeys: normalizeTopicKeys(child.topicKeys),
        matchPattern: child.matchPattern ? String(child.matchPattern) : null,
        hint: child.hint ? String(child.hint) : null,
        status: child.status == null ? null : normalizeStatus(child.status, "coming_soon"),
        order: Number(child.order) || 0,
      })),
    }))
  ).filter((m) => m.id && m.label);

  for (const major of majors) {
    if (!major.children.every((c) => c.id && c.label)) {
      throw new Error("invalid_subcategory");
    }
  }

  const featuredCount = majors.filter((m) => m.featuredOnHome).length;
  if (featuredCount > FEATURED_HOME_MAJOR_LIMIT) {
    throw new Error("featured_home_limit_exceeded");
  }

  // Replace catalog transactionally via delete+upsert (service role).
  const { error: delSubs } = await sb
    .from("theme_sub_categories")
    .delete()
    .neq("id", "");
  if (delSubs) throw new Error(delSubs.message || "delete_subs_failed");

  const { error: delMajors } = await sb
    .from("theme_major_categories")
    .delete()
    .neq("id", "");
  if (delMajors) throw new Error(delMajors.message || "delete_majors_failed");

  const majorPayload = majors.map((m) => ({
    id: m.id,
    label: m.label,
    hint: m.hint,
    description: m.description,
    icon_key: m.iconKey,
    tone: m.tone,
    tint: m.tint,
    border: m.border,
    status: m.status,
    featured_on_home: m.featuredOnHome,
    display_order: m.order,
    orphan_match_pattern: m.orphanMatchPattern,
    updated_at: new Date().toISOString(),
  }));

  const { error: insMajors } = await sb
    .from("theme_major_categories")
    .insert(majorPayload);
  if (insMajors) throw new Error(insMajors.message || "insert_majors_failed");

  const subPayload = majors.flatMap((m) =>
    m.children.map((c) => ({
      id: c.id,
      major_id: m.id,
      label: c.label,
      hint: c.hint,
      topic_keys: c.topicKeys,
      match_pattern: c.matchPattern,
      status: c.status,
      display_order: c.order,
      updated_at: new Date().toISOString(),
    }))
  );

  if (subPayload.length > 0) {
    const { error: insSubs } = await sb
      .from("theme_sub_categories")
      .insert(subPayload);
    if (insSubs) throw new Error(insSubs.message || "insert_subs_failed");
  }

  return { majors };
}

export async function updateThemeMajorCategory(
  patch: Partial<ThemeMajorCategoryDto> & { id: string }
): Promise<ThemeMajorCategoryDto> {
  const loaded = await loadThemeCatalogDtos({ includeHidden: true });
  if (loaded.source !== "database") {
    throw new Error("catalog_table_unavailable");
  }

  const next = loaded.majors.map((major) => {
    if (major.id !== patch.id) return major;
    return {
      ...major,
      ...patch,
      id: major.id,
      children: patch.children ?? major.children,
      status: normalizeStatus(patch.status ?? major.status, major.status),
    };
  });

  const saved = await replaceThemeCatalog(next);
  const updated = saved.majors.find((m) => m.id === patch.id);
  if (!updated) throw new Error("major_not_found");
  return updated;
}
