import { describe, expect, it } from "vitest";
import {
  FEATURED_HOME_MAJOR_LIMIT,
  buildSubCategoryRows,
  getThemeMajorCategory,
  isThemeJoinBlockedByCatalog,
  listFeaturedHomeMajorCategories,
  listThemeMajorCategories,
  parseThemeCatalogQuery,
  resolveMajorCategoryIdForTopic,
  resolveSubCategoryStatus,
  THEME_MAJOR_CATEGORIES,
  topicsForMajorCategory,
} from "./themeCatalog";

describe("themeCatalog", () => {
  it("lists ten majors with the four home representatives first by feature flag", () => {
    expect(listThemeMajorCategories().map((c) => c.id)).toEqual([
      "chat",
      "hobby",
      "school",
      "daily",
      "relationship",
      "identity",
      "beauty",
      "sports",
      "career",
      "creative",
    ]);
    expect(listThemeMajorCategories().map((c) => c.label)).toEqual([
      "雑談・交流",
      "趣味・エンタメ",
      "学校・勉強",
      "暮らし・日常",
      "恋愛・人間関係",
      "アイデンティティ・多様性",
      "美容・ファッション",
      "スポーツ・健康",
      "仕事・キャリア",
      "創作・クリエイティブ",
    ]);

    const featured = listFeaturedHomeMajorCategories();
    expect(featured).toHaveLength(FEATURED_HOME_MAJOR_LIMIT);
    expect(featured.map((c) => c.id)).toEqual([
      "chat",
      "hobby",
      "school",
      "daily",
    ]);
    expect(featured.every((c) => c.featuredOnHome)).toBe(true);
  });

  it("keeps home featured count capped even if more are flagged", () => {
    expect(
      THEME_MAJOR_CATEGORIES.filter((c) => c.featuredOnHome).length
    ).toBeLessThanOrEqual(FEATURED_HOME_MAJOR_LIMIT);
  });

  it("binds boys-school / girls-school under 学校・勉強 by topic_key", () => {
    expect(
      resolveMajorCategoryIdForTopic({
        key: "boys-school",
        topic_key: "boys-school",
        title: "男子校",
        description: "男性ユーザー向け",
      })
    ).toBe("school");
    expect(
      resolveMajorCategoryIdForTopic({
        key: "girls-school",
        topic_key: "girls-school",
        title: "女子校",
        description: "女性ユーザー向け",
      })
    ).toBe("school");
  });

  it("keeps 男子校 / 女子校 as school children, not majors", () => {
    const school = getThemeMajorCategory("school");
    expect(school?.children.map((c) => c.id)).toContain("school-boys");
    expect(school?.children.map((c) => c.id)).toContain("school-girls");
    expect(THEME_MAJOR_CATEGORIES.some((c) => c.label === "男子校")).toBe(
      false
    );
    expect(THEME_MAJOR_CATEGORIES.some((c) => c.label === "女子校")).toBe(
      false
    );
  });

  it("places LGBTQ+ under アイデンティティ・多様性, not adult content majors", () => {
    expect(
      resolveMajorCategoryIdForTopic({
        key: "lgbtq-talk",
        topic_key: "lgbtq-talk",
        title: "LGBTQ+",
        description: "セクシュアリティについて話す",
      })
    ).toBe("identity");
    const identity = getThemeMajorCategory("identity")!;
    expect(identity.children.some((c) => c.id === "id-lgbtq")).toBe(true);
  });

  it("routes sports / career / creative away from school and hobby", () => {
    expect(
      resolveMajorCategoryIdForTopic({
        key: "soccer",
        title: "スポーツ",
        description: "サッカーの話",
      })
    ).toBe("sports");
    expect(
      resolveMajorCategoryIdForTopic({
        key: "job",
        title: "仕事",
        description: "職場の話",
      })
    ).toBe("career");
    expect(
      resolveMajorCategoryIdForTopic({
        key: "illust",
        title: "イラスト",
        description: "創作の話",
      })
    ).toBe("creative");
  });

  it("builds school subcategory rows with DB topics claimed by topic_key", () => {
    const school = getThemeMajorCategory("school")!;
    const rows = buildSubCategoryRows(school, [
      {
        key: "boys-school",
        topic_key: "boys-school",
        title: "男子校",
        monthly_price: 400,
      },
      {
        key: "girls-school",
        topic_key: "girls-school",
        title: "女子校",
        monthly_price: 400,
      },
    ]);

    expect(rows[0]).toMatchObject({
      id: "school-boys",
      label: "男子校",
      comingSoon: true,
      status: "coming_soon",
      topic: { topic_key: "boys-school" },
    });
    expect(rows[1]).toMatchObject({
      id: "school-girls",
      label: "女子校",
      comingSoon: true,
      topic: { topic_key: "girls-school" },
    });
    expect(rows.every((r) => r.comingSoon)).toBe(true);
  });

  it("filters topics for a major without inventing majors for gender schools", () => {
    const paid = [
      {
        key: "boys-school",
        topic_key: "boys-school",
        title: "男子校",
        monthly_price: 400,
      },
      {
        key: "music",
        topic_key: "music",
        title: "音楽",
        description: "好きな音楽",
        monthly_price: 480,
      },
    ];
    expect(topicsForMajorCategory("school", paid).map((t) => t.key)).toEqual([
      "boys-school",
    ]);
    expect(topicsForMajorCategory("hobby", paid).map((t) => t.key)).toEqual([
      "music",
    ]);
  });

  it("blocks paid join while catalog status is coming_soon", () => {
    expect(
      isThemeJoinBlockedByCatalog({
        monthlyPrice: 400,
        status: "coming_soon",
      })
    ).toBe(true);
    expect(
      isThemeJoinBlockedByCatalog({ monthlyPrice: 400, status: "live" })
    ).toBe(false);
  });

  it("resolves child status from major when child omits status", () => {
    const school = getThemeMajorCategory("school")!;
    expect(resolveSubCategoryStatus(school, school.children[0])).toBe(
      "coming_soon"
    );
  });

  it("parses catalog query values safely", () => {
    expect(parseThemeCatalogQuery("school")).toBe("school");
    expect(parseThemeCatalogQuery("identity")).toBe("identity");
    expect(parseThemeCatalogQuery("boys-school")).toBeNull();
    expect(parseThemeCatalogQuery("")).toBeNull();
  });
});
