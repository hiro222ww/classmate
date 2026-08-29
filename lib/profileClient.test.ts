import { describe, expect, it } from "vitest";
import {
  computeDeclaredAgeEffective,
  hasMinimumProfile,
  isUserProfileComplete,
  resolveEffectiveProfileAge,
  yearsSinceAsOf,
} from "./profileClient";

describe("profileClient minimum vs complete", () => {
  const base = { device_id: "dev-1", display_name: "太郎" };

  it("isUserProfileComplete still requires birth_date and gender", () => {
    expect(
      isUserProfileComplete({
        ...base,
        declared_age: 20,
        declared_age_as_of: "2026-01-01",
      })
    ).toBe(false);

    expect(
      isUserProfileComplete({
        ...base,
        birth_date: "2000-01-15",
        gender: "male",
      })
    ).toBe(true);
  });

  it("hasMinimumProfile accepts declared_age without birth_date", () => {
    expect(
      hasMinimumProfile({
        ...base,
        declared_age: 20,
        declared_age_as_of: "2026-08-26",
      })
    ).toBe(true);

    expect(
      hasMinimumProfile({
        ...base,
        declared_age: 17,
        declared_age_as_of: "2026-08-26",
      })
    ).toBe(false);
  });

  it("hasMinimumProfile accepts birth_date-only profiles", () => {
    expect(
      hasMinimumProfile({
        ...base,
        birth_date: "2000-01-15",
        gender: "female",
      })
    ).toBe(true);
  });

  it("resolveEffectiveProfileAge prefers birth_date over declared", () => {
    expect(
      resolveEffectiveProfileAge({
        ...base,
        birth_date: "1990-06-01",
        declared_age: 20,
        declared_age_as_of: "2026-01-01",
      }, new Date("2026-08-26"))
    ).toBe(36);
  });

  it("advances declared age by calendar years since as_of", () => {
    expect(yearsSinceAsOf("2024-08-26", new Date("2026-08-26"))).toBe(2);
    expect(
      computeDeclaredAgeEffective(20, "2024-08-26", new Date("2026-08-26"))
    ).toBe(22);
  });
});
