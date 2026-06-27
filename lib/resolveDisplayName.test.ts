import { describe, expect, it } from "vitest";
import { pickCanonicalSessionMembers } from "./resolveDisplayName";

describe("pickCanonicalSessionMembers", () => {
  it("keeps only the latest row per logged-in user", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const rows = [
      {
        device_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        user_id: userId,
        joined_at: "2026-06-01T10:00:00.000Z",
      },
      {
        device_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        user_id: userId,
        joined_at: "2026-06-01T11:00:00.000Z",
      },
      {
        device_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        joined_at: "2026-06-01T09:00:00.000Z",
      },
    ];

    const canonical = pickCanonicalSessionMembers(rows);
    expect(canonical.size).toBe(2);
    expect(canonical.has("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBe(true);
    expect(canonical.has("cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toBe(true);
    expect(canonical.has("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(false);
  });
});
