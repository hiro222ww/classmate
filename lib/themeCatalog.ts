/**
 * Client-side 2-level theme catalog for 「探す」 / ホーム.
 *
 * - Does not rename or replace DB `topic_key` / billing fields.
 * - Majors are display groups; subs bind to existing topics by `topic_key`
 *   (preferred) with keyword fallback for future unlisted topics.
 * - Home shows at most FEATURED_HOME_MAJOR_LIMIT majors; full list lives on 探す.
 * - Availability is catalog-level so category/theme can go live independently later.
 */

/** Catalog / theme offer state — switchable per major or subcategory later. */
export type ThemeOfferStatus = "live" | "coming_soon";

export type ThemeMajorCategoryId =
  | "chat"
  | "hobby"
  | "school"
  | "daily"
  | "relationship"
  | "identity"
  | "beauty"
  | "sports"
  | "career"
  | "creative";

export type ThemeSubCategoryDef = {
  id: string;
  label: string;
  /** Exact topic_key bindings — survives title / copy changes. */
  topicKeys: readonly string[];
  /** Fallback match against title+description for uncatalogued topics. */
  match?: RegExp;
  hint?: string;
  /**
   * Per-theme offer state. Defaults to major.status when omitted.
   * Paid themes stay `coming_soon` until product enables join/billing.
   */
  status?: ThemeOfferStatus;
  /** Optional sort weight within a major (lower first). */
  order?: number;
};

export type ThemeMajorCategoryDef = {
  id: ThemeMajorCategoryId;
  label: string;
  hint: string;
  /** CSS tone modifier (`cm-home-theme-card--{tone}`). */
  tone: ThemeMajorCategoryId;
  tint: string;
  border: string;
  /** Category-level offer state (children may override). */
  status: ThemeOfferStatus;
  /** Show on home representative grid when true. Cap: FEATURED_HOME_MAJOR_LIMIT. */
  featuredOnHome?: boolean;
  /** Display order among majors (lower first). */
  order: number;
  children: readonly ThemeSubCategoryDef[];
  /**
   * Assign orphan paid topics (no child topicKeys/match hit) to this major.
   */
  orphanMatch?: RegExp;
};

/** Query param used for major deep-links from home / share URLs. */
export const THEME_CATALOG_QUERY_KEY = "cat";

/** Home always shows at most this many major categories. */
export const FEATURED_HOME_MAJOR_LIMIT = 4;

export const THEME_OFFER_COMING_SOON_LABEL = "準備中";

export const THEME_MAJOR_CATEGORIES: readonly ThemeMajorCategoryDef[] = [
  {
    id: "chat",
    label: "雑談・交流",
    hint: "気軽に話す",
    tone: "chat",
    tint: "linear-gradient(180deg, rgba(255,247,237,0.95), rgba(255,255,255,0.95))",
    border: "rgba(249, 115, 22, 0.22)",
    status: "coming_soon",
    featuredOnHome: true,
    order: 10,
    children: [
      {
        id: "chat-casual",
        label: "雑談",
        topicKeys: [],
        match: /雑談|交流|おしゃべり|フリートーク|chat|talk/,
        order: 10,
      },
      {
        id: "chat-friends",
        label: "友だち作り",
        topicKeys: [],
        match: /友だち|友達作り|友人/,
        order: 20,
      },
    ],
    orphanMatch: /雑談|交流|おしゃべり|フリートーク|chat|talk|友だち|友達/,
  },
  {
    id: "hobby",
    label: "趣味・エンタメ",
    hint: "好きを共有",
    tone: "hobby",
    tint: "linear-gradient(180deg, rgba(245,243,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(139, 92, 246, 0.22)",
    status: "coming_soon",
    featuredOnHome: true,
    order: 20,
    children: [
      {
        id: "hobby-game",
        label: "ゲーム",
        topicKeys: [],
        match: /ゲーム|game|esports|eスポーツ/,
        order: 10,
      },
      {
        id: "hobby-music",
        label: "音楽",
        topicKeys: [],
        match: /音楽|music|歌|メロディ/,
        order: 20,
      },
      {
        id: "hobby-anime",
        label: "アニメ・漫画",
        topicKeys: [],
        match: /アニメ|漫画|マンガ/,
        order: 30,
      },
      {
        id: "hobby-movie",
        label: "映画・ドラマ",
        topicKeys: [],
        match: /映画|ドラマ|movie/,
        order: 40,
      },
    ],
    orphanMatch: /趣味|hobby|ゲーム|音楽|映画|アニメ|漫画|ドラマ/,
  },
  {
    id: "school",
    label: "学校・勉強",
    hint: "学びの場",
    tone: "school",
    tint: "linear-gradient(180deg, rgba(236,254,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(20, 184, 166, 0.22)",
    status: "coming_soon",
    featuredOnHome: true,
    order: 30,
    children: [
      {
        id: "school-boys",
        label: "男子校",
        /** Seeded paid topic — keep topic_key stable. */
        topicKeys: ["boys-school"],
        order: 10,
      },
      {
        id: "school-girls",
        label: "女子校",
        topicKeys: ["girls-school"],
        order: 20,
      },
      {
        id: "school-study",
        label: "勉強",
        topicKeys: [],
        match: /勉強|学習|study|受験|宿題/,
        order: 30,
      },
      {
        id: "school-club",
        label: "部活",
        topicKeys: [],
        match: /部活|クラブ活動/,
        order: 40,
      },
    ],
    orphanMatch: /学校|勉強|学習|部活|study|school|受験/,
  },
  {
    id: "daily",
    label: "暮らし・日常",
    hint: "ふだんのこと",
    tone: "daily",
    tint: "linear-gradient(180deg, rgba(240,249,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(56, 189, 248, 0.25)",
    status: "coming_soon",
    featuredOnHome: true,
    order: 40,
    children: [
      {
        id: "daily-life",
        label: "日常",
        topicKeys: [],
        match: /日常|暮らし|生活|まったり|夜|おやすみ/,
        order: 10,
      },
      {
        id: "daily-travel",
        label: "旅行",
        topicKeys: [],
        match: /旅行|travel|旅|観光/,
        order: 20,
      },
      {
        id: "daily-food",
        label: "ごはん",
        topicKeys: [],
        match: /ごはん|食事|料理|グルメ|ご飯/,
        order: 30,
      },
    ],
    orphanMatch: /日常|暮らし|生活|旅行|夜|まったり|旅|ごはん|食事/,
  },
  {
    id: "relationship",
    label: "恋愛・人間関係",
    hint: "気持ちを整理",
    tone: "relationship",
    tint: "linear-gradient(180deg, rgba(255,241,242,0.95), rgba(255,255,255,0.95))",
    border: "rgba(244, 63, 94, 0.2)",
    status: "coming_soon",
    order: 50,
    children: [
      {
        id: "rel-love",
        label: "恋愛相談",
        topicKeys: [],
        match: /恋愛|恋|好きな人/,
        order: 10,
      },
      {
        id: "rel-friendship",
        label: "人間関係",
        topicKeys: [],
        match: /人間関係|友人関係|対人/,
        order: 20,
      },
    ],
    orphanMatch: /恋愛|恋|人間関係|好きな人|対人/,
  },
  {
    id: "identity",
    label: "アイデンティティ・多様性",
    hint: "自分らしく",
    tone: "identity",
    tint: "linear-gradient(180deg, rgba(245,243,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(124, 58, 237, 0.2)",
    status: "coming_soon",
    order: 60,
    children: [
      {
        id: "id-lgbtq",
        label: "LGBTQ+",
        topicKeys: [],
        match: /lgbtq|lgbt|セクシュアリティ|セクシュアル|クィア|ゲイ|レズ|バイ|トランス|非二元|Xジェンダー|アセク|アロマン/i,
        order: 10,
        hint: "プライバシーに配慮した場（準備中）",
      },
      {
        id: "id-self",
        label: "自分らしさ",
        topicKeys: [],
        match: /アイデンティティ|多様性|自分らしさ|ジェンダー/,
        order: 20,
      },
    ],
    orphanMatch:
      /lgbtq|lgbt|セクシュアリティ|アイデンティティ|多様性|ジェンダー|クィア/i,
  },
  {
    id: "beauty",
    label: "美容・ファッション",
    hint: "見た目の話",
    tone: "beauty",
    tint: "linear-gradient(180deg, rgba(253,242,248,0.95), rgba(255,255,255,0.95))",
    border: "rgba(236, 72, 153, 0.2)",
    status: "coming_soon",
    order: 70,
    children: [
      {
        id: "beauty-care",
        label: "美容",
        topicKeys: [],
        match: /美容|スキンケア|メイク|コスメ/,
        order: 10,
      },
      {
        id: "beauty-fashion",
        label: "ファッション",
        topicKeys: [],
        match: /ファッション|コーデ|服|髪型/,
        order: 20,
      },
    ],
    orphanMatch: /美容|ファッション|メイク|コスメ|スキンケア|コーデ/,
  },
  {
    id: "sports",
    label: "スポーツ・健康",
    hint: "からだのこと",
    tone: "sports",
    tint: "linear-gradient(180deg, rgba(240,253,244,0.95), rgba(255,255,255,0.95))",
    border: "rgba(34, 197, 94, 0.22)",
    status: "coming_soon",
    order: 80,
    children: [
      {
        id: "sports-play",
        label: "スポーツ",
        topicKeys: [],
        match: /スポーツ|サッカー|野球|バスケ|運動/,
        order: 10,
      },
      {
        id: "sports-health",
        label: "健康・フィットネス",
        topicKeys: [],
        match: /健康|フィットネス|筋トレ|ヨガ|ダイエット/,
        order: 20,
      },
    ],
    orphanMatch: /スポーツ|健康|フィットネス|筋トレ|運動|ヨガ/,
  },
  {
    id: "career",
    label: "仕事・キャリア",
    hint: "働き方の話",
    tone: "career",
    tint: "linear-gradient(180deg, rgba(239,246,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(59, 130, 246, 0.22)",
    status: "coming_soon",
    order: 90,
    children: [
      {
        id: "career-work",
        label: "仕事",
        topicKeys: [],
        match: /仕事|職場|職業|バイト|アルバイト/,
        order: 10,
      },
      {
        id: "career-path",
        label: "キャリア",
        topicKeys: [],
        match: /キャリア|転職|就活|進路/,
        order: 20,
      },
    ],
    orphanMatch: /仕事|キャリア|職場|職業|就活|転職|バイト/,
  },
  {
    id: "creative",
    label: "創作・クリエイティブ",
    hint: "つくる話",
    tone: "creative",
    tint: "linear-gradient(180deg, rgba(254,249,195,0.9), rgba(255,255,255,0.95))",
    border: "rgba(234, 179, 8, 0.28)",
    status: "coming_soon",
    order: 100,
    children: [
      {
        id: "creative-art",
        label: "イラスト・絵",
        topicKeys: [],
        match: /イラスト|絵|絵画|アート/,
        order: 10,
      },
      {
        id: "creative-make",
        label: "創作",
        topicKeys: [],
        match: /創作|小説|詩|デザイン|クリエイティブ|ものづくり/,
        order: 20,
      },
    ],
    orphanMatch: /創作|イラスト|クリエイティブ|デザイン|アート|小説/,
  },
] as const;

function byOrder<T extends { order?: number }>(a: T, b: T) {
  return (a.order ?? 0) - (b.order ?? 0);
}

export function listThemeMajorCategories(): ThemeMajorCategoryDef[] {
  return [...THEME_MAJOR_CATEGORIES].sort(byOrder);
}

/** Representative majors for the home grid (≤ FEATURED_HOME_MAJOR_LIMIT). */
export function listFeaturedHomeMajorCategories(): ThemeMajorCategoryDef[] {
  return listThemeMajorCategories()
    .filter((c) => c.featuredOnHome)
    .slice(0, FEATURED_HOME_MAJOR_LIMIT);
}

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

export function resolveSubCategoryStatus(
  major: ThemeMajorCategoryDef,
  child?: Pick<ThemeSubCategoryDef, "status"> | null
): ThemeOfferStatus {
  return child?.status ?? major.status;
}

export function isComingSoonStatus(status: ThemeOfferStatus) {
  return status !== "live";
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

function sortedChildren(major: ThemeMajorCategoryDef) {
  return [...major.children].sort(byOrder);
}

/** Prefer topic_key child hits, then keyword child hits, then orphanMatch. */
export function resolveMajorCategoryIdForTopic(
  topic: ThemeCatalogTopicLike
): ThemeMajorCategoryId {
  const key = topicKeyOf(topic);

  for (const major of listThemeMajorCategories()) {
    for (const child of sortedChildren(major)) {
      if (key && child.topicKeys.includes(key)) return major.id;
    }
  }

  for (const major of listThemeMajorCategories()) {
    for (const child of sortedChildren(major)) {
      if (child.match && child.match.test(topicText(topic))) return major.id;
    }
  }

  for (const major of listThemeMajorCategories()) {
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
 * - Catalog children always appear (placeholders when no topic).
 * - Extra paid DB topics that match the major but no child are appended.
 * - comingSoon follows catalog status (not joinable while coming_soon).
 */
export type ThemeSubCategoryRow<
  T extends ThemeCatalogTopicLike = ThemeCatalogTopicLike,
> = {
  id: string;
  label: string;
  hint: string;
  topic: T | null;
  status: ThemeOfferStatus;
  comingSoon: boolean;
};

export function buildSubCategoryRows<T extends ThemeCatalogTopicLike>(
  major: ThemeMajorCategoryDef,
  paidTopics: readonly T[]
): ThemeSubCategoryRow<T>[] {
  const inMajor = topicsForMajorCategory(major.id, paidTopics);
  const claimed = new Set<string>();
  const rows: ThemeSubCategoryRow<T>[] = [];

  for (const child of sortedChildren(major)) {
    const matched =
      inMajor.find((topic) => {
        const key = topicKeyOf(topic);
        if (claimed.has(key)) return false;
        return childMatchesTopic(child, topic);
      }) ?? null;

    if (matched) claimed.add(topicKeyOf(matched));

    const status = resolveSubCategoryStatus(major, child);
    const comingSoon = isComingSoonStatus(status);

    rows.push({
      id: child.id,
      label: matched?.title ?? child.label,
      hint:
        child.hint ??
        (comingSoon ? THEME_OFFER_COMING_SOON_LABEL : major.hint),
      topic: matched,
      status,
      comingSoon,
    });
  }

  for (const topic of inMajor) {
    const key = topicKeyOf(topic);
    if (claimed.has(key)) continue;
    claimed.add(key);
    const status = major.status;
    const comingSoon = isComingSoonStatus(status);
    rows.push({
      id: `topic:${key || topic.title}`,
      label: topic.title,
      hint: comingSoon ? THEME_OFFER_COMING_SOON_LABEL : major.hint,
      topic,
      status,
      comingSoon,
    });
  }

  return rows;
}

/** Join / billing allowed only when catalog status is live and topic is free or entitled later. */
export function isThemeJoinBlockedByCatalog(params: {
  monthlyPrice: number;
  status: ThemeOfferStatus;
}) {
  if (params.monthlyPrice > 0 && isComingSoonStatus(params.status)) return true;
  return isComingSoonStatus(params.status) && params.monthlyPrice > 0;
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

export function buildThemeSelectAllPath(opts?: {
  mode?: string | null;
  dev?: string | null;
}) {
  const params = new URLSearchParams();
  const mode = String(opts?.mode ?? "").trim();
  if (mode) params.set("mode", mode);
  const dev = String(opts?.dev ?? "").trim();
  if (dev) params.set("dev", dev);
  const q = params.toString();
  return q ? `/class/select?${q}` : "/class/select";
}
