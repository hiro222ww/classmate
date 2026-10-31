import { describe, expect, it } from "vitest";
import {
  buildSubCategoryRows,
  getThemeMajorCategory,
  parseThemeCatalogQuery,
  resolveMajorCategoryIdForTopic,
  THEME_MAJOR_CATEGORIES,
  topicsForMajorCategory,
} from "./themeCatalog";

describe("themeCatalog", () => {
  it("exposes the four major categories from the IA plan", () => {
    expect(THEME_MAJOR_CATEGORIES.map((c) => c.id)).toEqual([
      "chat",
      "hobby",
      "school",
      "daily",
    ]);
    expect(THEME_MAJOR_CATEGORIES.map((c) => c.label)).toEqual([
      "雑談・交流",
      "趣味・エンタメ",
      "学校・勉強",
      "暮らし・日常",
    ]);
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
    expect(school?.children.map((c) => c.id)).toEqual([
      "school-boys",
      "school-girls",
      "school-study",
    ]);
    expect(THEME_MAJOR_CATEGORIES.some((c) => c.label === "男子校")).toBe(
      false
    );
    expect(THEME_MAJOR_CATEGORIES.some((c) => c.label === "女子校")).toBe(
      false
    );
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

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      id: "school-boys",
      label: "男子校",
      comingSoon: true,
      topic: { topic_key: "boys-school" },
    });
    expect(rows[1]).toMatchObject({
      id: "school-girls",
      label: "女子校",
      comingSoon: true,
      topic: { topic_key: "girls-school" },
    });
    expect(rows[2]).toMatchObject({
      id: "school-study",
      label: "勉強",
      comingSoon: true,
      topic: null,
    });
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

  it("parses catalog query values safely", () => {
    expect(parseThemeCatalogQuery("school")).toBe("school");
    expect(parseThemeCatalogQuery("boys-school")).toBeNull();
    expect(parseThemeCatalogQuery("")).toBeNull();
  });
});
