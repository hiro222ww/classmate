import { describe, expect, it } from "vitest";
import { ADMIN_ROOMS_SESSION_MEMBERS_SELECT } from "@/app/api/admin/rooms/route";

describe("admin rooms session_members select", () => {
  it("uses joined_at instead of the missing created_at column", () => {
    expect(ADMIN_ROOMS_SESSION_MEMBERS_SELECT).toContain("joined_at");
    expect(ADMIN_ROOMS_SESSION_MEMBERS_SELECT).not.toMatch(/\bcreated_at\b/);
  });
});
