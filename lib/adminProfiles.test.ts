import { describe, expect, it } from "vitest";
import { isUserProfileComplete } from "@/lib/profileClient";
import { tokyoTodayRangeIso } from "@/lib/pageVisit";
import {
  buildAdminProfilesRecent,
  countCompleteProfiles,
  countCompleteProfilesCreatedToday,
  isCompleteAdminProfile,
  isCreatedInRange,
  toAdminProfileRecentItem,
  type AdminProfileRow,
} from "./adminProfiles";

function row(partial: Partial<AdminProfileRow>): AdminProfileRow {
  return {
    device_id: "11111111-1111-1111-1111-111111111111",
    display_name: "太郎",
    birth_date: "2000-01-15",
    gender: "male",
    created_at: "2026-08-08T01:00:00.000Z",
    user_id: null,
    ...partial,
  };
}

describe("admin profile completion alignment", () => {
  it("matches isUserProfileComplete", () => {
    const complete = row({});
    const incomplete = row({ display_name: "" });
    expect(isCompleteAdminProfile(complete)).toBe(
      isUserProfileComplete(complete)
    );
    expect(isCompleteAdminProfile(incomplete)).toBe(
      isUserProfileComplete(incomplete)
    );
    expect(isCompleteAdminProfile(complete)).toBe(true);
    expect(isCompleteAdminProfile(incomplete)).toBe(false);
  });
});

describe("JST today boundary counts", () => {
  it("counts only complete profiles created within Tokyo day bounds", () => {
    // 2026-08-07 15:00 UTC = 2026-08-08 00:00 JST
    const { startIso, endIso, day } = tokyoTodayRangeIso(
      Date.parse("2026-08-07T15:30:00.000Z")
    );
    expect(day).toBe("2026-08-08");

    const justBefore = "2026-08-07T14:59:59.999Z"; // still 08-07 JST
    const startJst = "2026-08-07T15:00:00.000Z"; // 08-08 00:00 JST
    const mid = "2026-08-08T03:00:00.000Z";
    const endJst = "2026-08-08T14:59:59.999Z"; // 08-08 23:59:59.999 JST
    const justAfter = "2026-08-08T15:00:00.000Z"; // 08-09 JST

    expect(isCreatedInRange(justBefore, startIso, endIso)).toBe(false);
    expect(isCreatedInRange(startJst, startIso, endIso)).toBe(true);
    expect(isCreatedInRange(mid, startIso, endIso)).toBe(true);
    expect(isCreatedInRange(endJst, startIso, endIso)).toBe(true);
    expect(isCreatedInRange(justAfter, startIso, endIso)).toBe(false);

    const rows = [
      row({ created_at: justBefore }),
      row({ created_at: startJst }),
      row({ created_at: mid, display_name: "" }), // incomplete
      row({ created_at: endJst, display_name: "花子", gender: "female" }),
      row({ created_at: justAfter }),
    ];

    // complete: before / start / end / after (mid is incomplete)
    expect(countCompleteProfiles(rows)).toBe(4);
    expect(countCompleteProfilesCreatedToday(rows, startIso, endIso)).toBe(2);
  });
});

describe("recent list", () => {
  it("returns complete profiles newest-first with age/gender labels", () => {
    const rows = [
      row({
        created_at: "2026-08-01T00:00:00.000Z",
        display_name: "古い",
      }),
      row({
        created_at: "2026-08-08T00:00:00.000Z",
        display_name: "新しい",
        birth_date: "1995-06-01",
        gender: "female",
        user_id: "22222222-2222-2222-2222-222222222222",
      }),
      row({
        created_at: "2026-08-07T00:00:00.000Z",
        display_name: "",
      }),
    ];

    const recent = buildAdminProfilesRecent(rows, 10);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.display_name).toBe("新しい");
    expect(recent[0]?.gender_label).toBe("女性");
    expect(recent[0]?.user_id).toBe(
      "22222222-2222-2222-2222-222222222222"
    );
    expect(typeof recent[0]?.age).toBe("number");
    expect(recent[1]?.display_name).toBe("古い");

    expect(toAdminProfileRecentItem(row({ display_name: "" }))).toBeNull();
  });
});
