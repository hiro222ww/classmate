import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_BANNERS,
  resolveActiveHomeBanners,
  type HomeBanner,
} from "./homeBanners";

const base: HomeBanner = {
  id: "a",
  imageSrc: "/a.jpg",
  kind: "atmosphere",
  sortOrder: 20,
};

describe("resolveActiveHomeBanners", () => {
  it("returns the default sunset banner", () => {
    const active = resolveActiveHomeBanners(DEFAULT_HOME_BANNERS);
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe("atmosphere-sunset-default");
    expect(active[0]?.headline).toContain("景色");
  });

  it("filters by schedule and sorts by sortOrder", () => {
    const now = Date.parse("2026-06-15T12:00:00Z");
    const banners: HomeBanner[] = [
      {
        ...base,
        id: "future",
        sortOrder: 1,
        startsAt: "2026-07-01T00:00:00Z",
      },
      {
        ...base,
        id: "expired",
        sortOrder: 2,
        endsAt: "2026-01-01T00:00:00Z",
      },
      { ...base, id: "live-b", sortOrder: 30 },
      { ...base, id: "live-a", sortOrder: 10 },
    ];
    const active = resolveActiveHomeBanners(banners, now);
    expect(active.map((b) => b.id)).toEqual(["live-a", "live-b"]);
  });
});
