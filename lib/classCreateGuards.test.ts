import { describe, expect, it } from "vitest";
import {
  assertPublicCreateFlags,
  deriveCanCreateClasses,
  hasCreateClassEntitlement,
  normalizeCreateMinAge,
} from "@/lib/classCreateGuards";

describe("classCreateGuards", () => {
  it("derives create permission from slots or topic_plan", () => {
    expect(deriveCanCreateClasses({ class_slots: 1, topic_plan: 0 })).toBe(
      false
    );
    expect(deriveCanCreateClasses({ class_slots: 3, topic_plan: 0 })).toBe(
      true
    );
    expect(deriveCanCreateClasses({ class_slots: 1, topic_plan: 400 })).toBe(
      true
    );
  });

  it("prefers explicit can_create_classes flag", () => {
    expect(
      hasCreateClassEntitlement({
        can_create_classes: false,
        class_slots: 5,
        topic_plan: 400,
      })
    ).toBe(false);
    expect(
      hasCreateClassEntitlement({
        can_create_classes: true,
        class_slots: 1,
        topic_plan: 0,
      })
    ).toBe(true);
  });

  it("rejects min age under 18", () => {
    expect(normalizeCreateMinAge(0).ok).toBe(false);
    expect(normalizeCreateMinAge(17).ok).toBe(false);
    expect(normalizeCreateMinAge(18)).toEqual({ ok: true, minAge: 18 });
    expect(normalizeCreateMinAge(25)).toEqual({ ok: true, minAge: 25 });
  });

  it("rejects sensitive/premium spoof from public create", () => {
    expect(assertPublicCreateFlags({ isSensitive: true }).ok).toBe(false);
    expect(assertPublicCreateFlags({ isPremium: true }).ok).toBe(false);
    expect(assertPublicCreateFlags({})).toEqual({
      ok: true,
      isSensitive: false,
      isPremium: false,
    });
  });
});
