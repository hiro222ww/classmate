import { describe, expect, it } from "vitest";
import {
  buildTwoWeekCalendarPlans,
  jstScheduledIso,
} from "@/lib/marketing/calendar14";
import { MARKETING_POST_TYPES } from "@/lib/marketing/types";

describe("buildTwoWeekCalendarPlans", () => {
  it("covers 14 days with mixed types and no confirmed fake events", () => {
    const plans = buildTwoWeekCalendarPlans("2026-11-17");
    expect(plans.length).toBeGreaterThanOrEqual(14);
    expect(plans.every((p) => p.body_text.length <= 140)).toBe(true);
    const types = new Set(plans.map((p) => p.post_type));
    expect(types.size).toBeGreaterThanOrEqual(4);
    for (const t of types) {
      expect(MARKETING_POST_TYPES).toContain(t);
    }
    const joined = plans.map((p) => p.body_text).join("\n");
    expect(joined).not.toMatch(/利用者\d|万人が/);
    expect(joined).toMatch(/開催は確定していません|まだ初期|検討|もし/);
  });
});

describe("jstScheduledIso", () => {
  it("builds JST wall time as absolute ISO", () => {
    const iso = jstScheduledIso({
      startYmd: "2026-11-17",
      dayOffset: 0,
      hourJst: 21,
      minuteJst: 0,
    });
    expect(iso).toBe("2026-11-17T12:00:00.000Z");
  });
});
