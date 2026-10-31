import { describe, expect, it } from "vitest";
import {
  canJoinTopicByEntitlement,
  resolveEffectiveTopicPlan,
} from "@/lib/topicJoinEntitlement";

describe("topicJoinEntitlement", () => {
  it("allows free topics always", () => {
    expect(
      canJoinTopicByEntitlement({
        themeBillingEnabled: true,
        monthlyPrice: 0,
        topicPlan: 0,
      })
    ).toBe(true);
  });

  it("allows paid topics when theme billing is off", () => {
    expect(
      canJoinTopicByEntitlement({
        themeBillingEnabled: false,
        monthlyPrice: 400,
        topicPlan: 0,
      })
    ).toBe(true);
  });

  it("requires topic_plan coverage when theme billing is on", () => {
    expect(
      canJoinTopicByEntitlement({
        themeBillingEnabled: true,
        monthlyPrice: 400,
        topicPlan: 0,
      })
    ).toBe(false);
    expect(
      canJoinTopicByEntitlement({
        themeBillingEnabled: true,
        monthlyPrice: 400,
        topicPlan: 400,
      })
    ).toBe(true);
    expect(
      canJoinTopicByEntitlement({
        themeBillingEnabled: true,
        monthlyPrice: 800,
        topicPlan: 400,
      })
    ).toBe(false);
  });

  it("resolves legacy theme_pass to 1200", () => {
    expect(resolveEffectiveTopicPlan({ theme_pass: true })).toBe(1200);
    expect(resolveEffectiveTopicPlan({ topic_plan: 400, theme_pass: true })).toBe(
      400
    );
  });
});
