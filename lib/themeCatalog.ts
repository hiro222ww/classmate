/**
 * Client-side 2-level theme catalog for 「探す」.
 *
 * - Does not rename or replace DB `topic_key` / billing fields.
 * - Majors are display groups; subs bind to existing topics by `topic_key`
 *   (preferred) with keyword fallback for future unlisted topics.
 * - All paid themes remain teasers (準備中) until product enables them.
 */

export type ThemeMajorCategoryId =
  | "chat"
  | "hobby"
  | "school"
  | "daily";

export type ThemeSubCategoryDef = {
  id: string;
  label: string;
  /** Exact topic_key bindings — survives title / copy changes. */
  topicKeys: readonly string[];
  /** Fallback match against title+description for uncatalogued topics. */
  match?: RegExp;
  hint?: string;
};

export type ThemeMajorCategoryDef = {
  id: ThemeMajorCategoryId;
  label: string;
  hint: string;
  /** CSS tone modifier (`cm-home-theme-card--{tone}`). */
  tone: ThemeMajorCategoryId;
  tint: string;
  border: string;
  children: readonly ThemeSubCategoryDef[];
  /**
   * Assign orphan paid topics (no child topicKeys/match hit) to this major.
   */
  orphanMatch?: RegExp;
};

/** Query param used for major deep-links from home / share URLs. */
export const THEME_CATALOG_QUERY_KEY = "cat";

export const THEME_MAJOR_CATEGORIES: readonly ThemeMajorCategoryDef[] = [
  {
    id: "chat",
    label: "雑談・交流",
    hint: "気軽に話す",
    tone: "chat",
    tint: "linear-gradient(180deg, rgba(255,247,237,0.95), rgba(255,255,255,0.95))",
    border: "rgba(249, 115, 22, 0.22)",
    children: [
      {
        id: "chat-casual",
        label: "雑談",
        topicKeys: [],
        match: /雑談|交流|おしゃべり|フリートーク|chat|talk/,
        hint: "準備中",
      },
    ],
    orphanMatch: /雑談|交流|おしゃべり|フリートーク|chat|talk/,
  },
  {
    id: "hobby",
    label: "趣味・エンタメ",
    hint: "好きを共有",
    tone: "hobby",
    tint: "linear-gradient(180deg, rgba(245,243,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(139, 92, 246, 0.22)",
    children: [
      {
        id: "hobby-game",
        label: "ゲーム",
        topicKeys: [],
        match: /ゲーム|game|esports|eスポーツ/,
        hint: "準備中",
      },
      {
        id: "hobby-music",
        label: "音楽",
        topicKeys: [],
        match: /音楽|music|歌|メロディ/,
        hint: "準備中",
      },
      {
        id: "hobby-anime",
        label: "アニメ・漫画",
        topicKeys: [],
        match: /アニメ|漫画|マンガ|イラスト|創作/,
        hint: "準備中",
      },
    ],
    orphanMatch: /趣味|hobby|ゲーム|音楽|映画|アニメ|漫画|イラスト|創作/,
  },
  {
    id: "school",
    label: "学校・勉強",
    hint: "学びの場",
    tone: "school",
    tint: "linear-gradient(180deg, rgba(236,254,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(20, 184, 166, 0.22)",
    children: [
      {
        id: "school-boys",
        label: "男子校",
        /** Seeded paid topic — keep topic_key stable. */
        topicKeys: ["boys-school"],
        hint: "準備中",
      },
      {
        id: "school-girls",
        label: "女子校",
        topicKeys: ["girls-school"],
        hint: "準備中",
      },
      {
        id: "school-study",
        label: "勉強",
        topicKeys: [],
        match: /勉強|学習|study|受験|宿題/,
        hint: "準備中",
      },
    ],
    orphanMatch: /学校|勉強|学習|部活|スポーツ|仕事|職業|study|school/,
  },
  {
    id: "daily",
    label: "暮らし・日常",
    hint: "ふだんのこと",
    tone: "daily",
    tint: "linear-gradient(180deg, rgba(240,249,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(56, 189, 248, 0.25)",
    children: [
      {
        id: "daily-life",
        label: "日常",
        topicKeys: [],
        match: /日常|暮らし|生活|まったり|夜|おやすみ/,
        hint: "準備中",
      },
      {
        id: "daily-travel",
        label: "旅行",
        topicKeys: [],
        match: /旅行|travel|旅|観光/,
        hint: "準備中",
      },
    ],
    orphanMatch: /日常|暮らし|生活|旅行|夜|まったり|旅/,
  },
] as const;

export function isThemeMajorCategoryId(
  value: unknown
): value is ThemeMajorCategoryId {
  const id = String(value ?? "").trim();
  return THEME_MAJOR_CATEGORIES.some((c) => c.id === id);
}

export function parseThemeCatalogQuery(
  value: unknown
): ThemeMajorCategoryId | null {
  const id = String(value ?? "").trim();
  return isThemeMajorCategoryId(id) ? id : null;
}

export function getThemeMajorCategory(
  id: ThemeMajorCategoryId | null | undefined
): ThemeMajorCategoryDef | null {
  if (!id) return null;
  return THEME_MAJOR_CATEGORIES.find((c) => c.id === id) ?? null;
}

export type ThemeCatalogTopicLike = {
  key: string;
  title: string;
  description?: string | null;
  topic_key?: string | null;
  monthly_price?: number;
};

function topicText(topic: ThemeCatalogTopicLike) {
  return `${topic.title} ${topic.description ?? ""}`;
}

function topicKeyOf(topic: ThemeCatalogTopicLike) {
  return String(topic.topic_key ?? topic.key ?? "").trim();
}

function childMatchesTopic(
  child: ThemeSubCategoryDef,
  topic: ThemeCatalogTopicLike
) {
  const key = topicKeyOf(topic);
  if (key && child.topicKeys.includes(key)) return true;
  if (child.match && child.match.test(topicText(topic))) return true;
  return false;
}

/** Prefer topic_key child hits, then keyword child hits, then orphanMatch. */
export function resolveMajorCategoryIdForTopic(
  topic: ThemeCatalogTopicLike
): ThemeMajorCategoryId {
  const key = topicKeyOf(topic);

  for (const major of THEME_MAJOR_CATEGORIES) {
    for (const child of major.children) {
      if (key && child.topicKeys.includes(key)) return major.id;
    }
  }

  for (const major of THEME_MAJOR_CATEGORIES) {
    for (const child of major.children) {
      if (child.match && child.match.test(topicText(topic))) return major.id;
    }
  }

  for (const major of THEME_MAJOR_CATEGORIES) {
    if (major.orphanMatch?.test(topicText(topic))) return major.id;
  }

  return "daily";
}

export function topicsForMajorCategory<T extends ThemeCatalogTopicLike>(
  majorId: ThemeMajorCategoryId,
  topics: readonly T[]
): T[] {
  return topics.filter(
    (topic) => resolveMajorCategoryIdForTopic(topic) === majorId
  );
}

/**
 * Compact subcategory rows for a major drill-down.
 * - Catalog children always appear (準備中 placeholders when no topic).
 * - Extra paid DB topics that match the major but no child are appended.
 */
export type ThemeSubCategoryRow<T extends ThemeCatalogTopicLike = ThemeCatalogTopicLike> =
  {
    id: string;
    label: string;
    hint: string;
    topic: T | null;
    comingSoon: true;
  };

export function buildSubCategoryRows<T extends ThemeCatalogTopicLike>(
  major: ThemeMajorCategoryDef,
  paidTopics: readonly T[]
): ThemeSubCategoryRow<T>[] {
  const inMajor = topicsForMajorCategory(major.id, paidTopics);
  const claimed = new Set<string>();
  const rows: ThemeSubCategoryRow<T>[] = [];

  for (const child of major.children) {
    const matched =
      inMajor.find((topic) => {
        const key = topicKeyOf(topic);
        if (claimed.has(key)) return false;
        return childMatchesTopic(child, topic);
      }) ?? null;

    if (matched) claimed.add(topicKeyOf(matched));

    rows.push({
      id: child.id,
      label: matched?.title ?? child.label,
      hint: child.hint ?? "準備中",
      topic: matched,
      comingSoon: true,
    });
  }

  for (const topic of inMajor) {
    const key = topicKeyOf(topic);
    if (claimed.has(key)) continue;
    claimed.add(key);
    rows.push({
      id: `topic:${key || topic.title}`,
      label: topic.title,
      hint: "準備中",
      topic,
      comingSoon: true,
    });
  }

  return rows;
}

export function buildThemeSelectCategoryPath(
  majorId: ThemeMajorCategoryId,
  opts?: { mode?: string | null; dev?: string | null }
) {
  const params = new URLSearchParams();
  params.set(THEME_CATALOG_QUERY_KEY, majorId);
  const mode = String(opts?.mode ?? "").trim();
  if (mode) params.set("mode", mode);
  const dev = String(opts?.dev ?? "").trim();
  if (dev) params.set("dev", dev);
  return `/class/select?${params.toString()}`;
}
