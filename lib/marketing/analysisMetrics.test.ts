import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PeriodAnalysisSnapshot } from "@/lib/marketing/analysisMetrics";

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: () => ({}) },
}));

vi.mock("@/lib/marketing/metrics", () => ({
  loadMarketingDashboardMetrics: async () => ({ ok: false, error: "mocked" }),
}));

function stubSnapshot(
  overrides: Partial<PeriodAnalysisSnapshot> = {}
): PeriodAnalysisSnapshot {
  return {
    days: 7,
    metrics: {
      startIso: "2026-11-10T00:00:00.000Z",
      endIso: "2026-11-17T00:00:00.000Z",
      rangeDays: 7,
      visitsBySource: [{ source: "x", visits: 12, uniqueDevices: 10 }],
      registrationsBySource: [{ source: "x", count: 2 }],
      visitToRegisterRateBySource: [
        { source: "x", visits: 12, registrations: 2, rate: 2 / 12 },
      ],
      callStartedBySource: [{ source: "x", count: 1 }],
      callEstablished: {
        measured: false,
        reason: "call_established event not defined",
      },
      dailyVisits: [{ day: "2026-11-16", visits: 3 }],
      postPerformance: [
        {
          utmContent: "abc",
          postId: null,
          bodyPreview: "hello",
          visits: 5,
          registrations: 1,
          callStarted: 0,
        },
      ],
      notes: ["utm only"],
    },
    byPostType: [
      {
        postType: "empathy",
        posts: 2,
        visits: 5,
        registrations: 1,
        callStarted: 0,
      },
    ],
    byHourJst: [{ hour: 21, posts: 1, visits: 5, registrations: 1 }],
    callEstablished: {
      measured: false,
      reason: "call_established event not defined",
    },
    sampleSize: {
      utmVisits: 12,
      registrationsWithUtm: 2,
      publishedOrScheduledPosts: 2,
    },
    dataQuality: "limited",
    ...overrides,
  };
}

describe("sanitizeSnapshotForAi", () => {
  let sanitizeSnapshotForAi: typeof import("@/lib/marketing/analysisMetrics").sanitizeSnapshotForAi;

  beforeAll(async () => {
    ({ sanitizeSnapshotForAi } = await import("@/lib/marketing/analysisMetrics"));
  });

  it("keeps aggregates and marks X engagement as not measured", () => {
    const out = sanitizeSnapshotForAi(stubSnapshot());
    expect(out.dataQuality).toBe("limited");
    expect(out.visitsBySource[0]?.source).toBe("x");
    expect(out.notMeasured.some((n) => String(n).includes("impressions"))).toBe(
      true
    );
    expect(out.callEstablished.measured).toBe(false);
  });
});
