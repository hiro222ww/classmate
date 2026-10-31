import { describe, expect, it } from "vitest";
import {
  CLASS_CREATE_MIN_AGE,
  deriveCanCreateClasses,
  hasCreateClassEntitlement,
} from "@/lib/classCreateGuards";

describe("classCreateGuards (UI)", () => {
  it("exposes adult min age for create form defaults", () => {
    expect(CLASS_CREATE_MIN_AGE).toBe(18);
  });

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
    expect(hasCreateClassEntitlement(null)).toBe(false);
  });
});
