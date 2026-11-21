import { describe, expect, it } from "vitest";
import {
  buildProposalDraftsFromAnalysis,
  fingerprintProposal,
} from "@/lib/marketing/proposals";
import { buildCodeReviewUiSuggestions } from "@/lib/marketing/uiSuggestions";
import type { PeriodAnalysisSnapshot } from "@/lib/marketing/analysisMetrics";

function snap(
  overrides: Partial<PeriodAnalysisSnapshot> & {
    sampleSize: PeriodAnalysisSnapshot["sampleSize"];
    dataQuality: PeriodAnalysisSnapshot["dataQuality"];
  }
): PeriodAnalysisSnapshot {
  return {
    days: 7,
    metrics: {
      rangeDays: 7,
      startIso: new Date().toISOString(),
      endIso: new Date().toISOString(),
      visitsBySource: [],
      dailyVisits: [],
      registrationsBySource: [],
      visitToRegisterRateBySource: [],
      callStartedBySource: overrides.metrics?.callStartedBySource ?? [],
      callEstablished: { measured: false, reason: "未計測" },
      postPerformance: [],
      notes: [],
    },
    byPostType: [],
    byHourJst: [],
    callEstablished: { measured: false, reason: "未計測" },
    ...overrides,
  };
}

describe("fingerprintProposal", () => {
  it("is stable for same content", () => {
    const a = fingerprintProposal({
      area: "home_hero",
      title: "タイトル",
      summary: "概要",
    });
    const b = fingerprintProposal({
      area: "home_hero",
      title: "タイトル",
      summary: "概要",
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it("changes when title changes", () => {
    const a = fingerprintProposal({
      area: "home_hero",
      title: "A",
      summary: "概要",
    });
    const b = fingerprintProposal({
      area: "home_hero",
      title: "B",
      summary: "概要",
    });
    expect(a).not.toBe(b);
  });
});

describe("buildProposalDraftsFromAnalysis", () => {
  it("includes UI suggestions and measurement note when insufficient", () => {
    const drafts = buildProposalDraftsFromAnalysis({
      uiSuggestions: buildCodeReviewUiSuggestions(),
      d7: snap({
        sampleSize: {
          utmVisits: 0,
          registrationsWithUtm: 0,
          publishedOrScheduledPosts: 0,
        },
        dataQuality: "insufficient",
      }),
    });
    expect(drafts.length).toBeGreaterThanOrEqual(6);
    expect(drafts.some((d) => d.area === "home_hero")).toBe(true);
    expect(drafts.some((d) => d.area === "measurement")).toBe(true);
  });

  it("adds high-priority funnel proposals for low conversion", () => {
    const drafts = buildProposalDraftsFromAnalysis({
      uiSuggestions: [],
      d7: snap({
        sampleSize: {
          utmVisits: 100,
          registrationsWithUtm: 2,
          publishedOrScheduledPosts: 5,
        },
        dataQuality: "limited",
        metrics: {
          rangeDays: 7,
          startIso: "",
          endIso: "",
          visitsBySource: [],
          dailyVisits: [],
          registrationsBySource: [],
          visitToRegisterRateBySource: [],
          callStartedBySource: [{ source: "x", count: 0 }],
          callEstablished: { measured: false, reason: "未計測" },
          postPerformance: [],
          notes: [],
        },
      }),
    });
    const funnel = drafts.filter((d) => d.category === "funnel" && d.priority === "high");
    expect(funnel.some((d) => d.area === "onboarding")).toBe(true);
  });
});
