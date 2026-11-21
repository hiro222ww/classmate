import { describe, expect, it } from "vitest";
import {
  classifyFeedbackHeuristic,
  priorityScore,
} from "@/lib/feedback/classify";

describe("classifyFeedbackHeuristic", () => {
  it("flags safety content as critical and human-review", () => {
    const r = classifyFeedbackHeuristic({
      categoryHint: "other",
      redactedBody: "嫌がらせを受けたので対応してほしい",
    });
    expect(r.safetyFlag).toBe(true);
    expect(r.category).toBe("safety");
    expect(r.severity).toBe("critical");
  });

  it("detects call-related bugs as high impact", () => {
    const r = classifyFeedbackHeuristic({
      categoryHint: "other",
      redactedBody: "ランダム通話でマイクが聞こえず切断される不具合",
    });
    expect(r.category).toBe("bug");
    expect(r.callImpact).toBe("likely");
    expect(r.severity).toBe("high");
  });
});

describe("priorityScore", () => {
  it("ranks safety highest", () => {
    const safe = priorityScore({
      severity: "critical",
      uniqueReporterCount: 1,
      callImpact: "none",
      safetyFlag: true,
    });
    const normal = priorityScore({
      severity: "high",
      uniqueReporterCount: 5,
      callImpact: "likely",
      safetyFlag: false,
    });
    expect(safe).toBeGreaterThan(normal);
  });
});
