import { describe, expect, it } from "vitest";
import {
  PAGE_VISIT_SERVER_DEDUPE_MS,
  isBotUserAgent,
  isWithinDedupeWindow,
  normalizePageVisitPath,
  pageVisitDedupeVisitorKey,
  shouldTrackPagePath,
  tokyoTodayRangeIso,
  truncatePageVisitText,
} from "./pageVisit";

describe("normalizePageVisitPath", () => {
  it("strips query/hash and ensures leading slash", () => {
    expect(normalizePageVisitPath("billing?x=1#y")).toBe("/billing");
    expect(normalizePageVisitPath("/premium/")).toBe("/premium");
    expect(normalizePageVisitPath("https://example.com/home?a=1")).toBe(
      "/home"
    );
  });

  it("collapses duplicate slashes and truncates long paths", () => {
    expect(normalizePageVisitPath("//a///b")).toBe("/a/b");
    const long = `/${"a".repeat(300)}`;
    expect(normalizePageVisitPath(long).length).toBe(200);
  });
});

describe("shouldTrackPagePath", () => {
  it("allows user pages including root", () => {
    expect(shouldTrackPagePath("/")).toBe(true);
    expect(shouldTrackPagePath("/billing")).toBe(true);
    expect(shouldTrackPagePath("/premium")).toBe(true);
  });

  it("skips admin, api, next, brand, and static assets", () => {
    expect(shouldTrackPagePath("/admin")).toBe(false);
    expect(shouldTrackPagePath("/admin/visits")).toBe(false);
    expect(shouldTrackPagePath("/api/page-visit")).toBe(false);
    expect(shouldTrackPagePath("/_next/static/chunk.js")).toBe(false);
    expect(shouldTrackPagePath("/brand/logo.png")).toBe(false);
    expect(shouldTrackPagePath("/favicon.ico")).toBe(false);
  });
});

describe("isBotUserAgent", () => {
  it("detects common bots and ignores normal browsers", () => {
    expect(isBotUserAgent("Googlebot/2.1")).toBe(true);
    expect(isBotUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      )
    ).toBe(false);
    expect(isBotUserAgent("")).toBe(false);
  });
});

describe("dedupe helpers", () => {
  it("prefers user_id over device_id for visitor key", () => {
    expect(
      pageVisitDedupeVisitorKey({
        userId: "u1",
        deviceId: "d1",
      })
    ).toBe("u:u1");
    expect(pageVisitDedupeVisitorKey({ deviceId: "d1" })).toBe("d:d1");
    expect(pageVisitDedupeVisitorKey({})).toBeNull();
  });

  it("detects visits inside the server dedupe window", () => {
    const now = Date.parse("2026-08-08T12:00:00.000Z");
    const recent = new Date(now - 60_000).toISOString();
    const old = new Date(now - PAGE_VISIT_SERVER_DEDUPE_MS - 1).toISOString();
    expect(
      isWithinDedupeWindow({
        previousVisitedAt: recent,
        nowMs: now,
      })
    ).toBe(true);
    expect(
      isWithinDedupeWindow({
        previousVisitedAt: old,
        nowMs: now,
      })
    ).toBe(false);
    expect(
      isWithinDedupeWindow({
        previousVisitedAt: null,
        nowMs: now,
      })
    ).toBe(false);
  });
});

describe("truncatePageVisitText / tokyoTodayRangeIso", () => {
  it("truncates text and returns null for empty", () => {
    expect(truncatePageVisitText("  abc  ", 10)).toBe("abc");
    expect(truncatePageVisitText("abcdef", 3)).toBe("abc");
    expect(truncatePageVisitText("   ", 10)).toBeNull();
  });

  it("returns Tokyo calendar day bounds", () => {
    // 2026-08-07 15:00 UTC = 2026-08-08 00:00 JST
    const range = tokyoTodayRangeIso(Date.parse("2026-08-07T15:30:00.000Z"));
    expect(range.day).toBe("2026-08-08");
    expect(range.startIso).toBe(new Date("2026-08-08T00:00:00+09:00").toISOString());
    expect(range.endIso).toBe(
      new Date("2026-08-08T23:59:59.999+09:00").toISOString()
    );
  });
});
