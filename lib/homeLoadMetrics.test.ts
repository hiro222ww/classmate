import { describe, expect, it } from "vitest";
import {
  formatClassmatePerfLine,
  planHomeMembersRequests,
  publishClassmatePerf,
} from "@/lib/homeLoadMetrics";

describe("planHomeMembersRequests", () => {
  it("counts members+presence for all classes and status only with session", () => {
    const plan = planHomeMembersRequests({
      classIds: ["a", "b", "c"],
      sessionIdByClass: new Map([
        ["a", "sess-a"],
        ["b", ""],
        ["c", "sess-c"],
      ]),
    });
    expect(plan).toEqual({
      classCount: 3,
      withSessionCount: 2,
      membersRequests: 3,
      statusRequests: 2,
      presenceRequests: 3,
      totalRequests: 8,
    });
  });

  it("does not mix session flags across classes", () => {
    const plan = planHomeMembersRequests({
      classIds: ["only-a"],
      sessionIdByClass: new Map([["other", "sess-x"]]),
    });
    expect(plan.statusRequests).toBe(0);
    expect(plan.totalRequests).toBe(2);
  });
});

describe("publishClassmatePerf", () => {
  it("merges into window snapshot without PII fields", () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    const snap = publishClassmatePerf({
      homeFirstPaintMs: 100,
      membersFirstPaintMs: 250,
      callStateReadyMs: 400,
      membersRequestCount: 4,
    });
    expect(snap?.homeFirstPaintMs).toBe(100);
    expect(formatClassmatePerfLine(snap!)).toContain("membersFirstPaintMs=250");
    expect(formatClassmatePerfLine(snap!)).not.toMatch(/device|photo|name=/i);
  });
});
