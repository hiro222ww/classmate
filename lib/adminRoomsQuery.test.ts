import { describe, expect, it } from "vitest";
import {
  ADMIN_ROOMS_SESSION_MEMBERS_SELECT,
  parseAdminRoomsScope,
} from "@/app/api/admin/rooms/route";

describe("admin rooms session_members select", () => {
  it("uses joined_at instead of the missing created_at column", () => {
    expect(ADMIN_ROOMS_SESSION_MEMBERS_SELECT).toContain("joined_at");
    expect(ADMIN_ROOMS_SESSION_MEMBERS_SELECT).not.toMatch(/\bcreated_at\b/);
  });
});

describe("parseAdminRoomsScope", () => {
  it("defaults to active and accepts ended/all", () => {
    expect(parseAdminRoomsScope(null)).toBe("active");
    expect(parseAdminRoomsScope("")).toBe("active");
    expect(parseAdminRoomsScope("ACTIVE")).toBe("active");
    expect(parseAdminRoomsScope("ended")).toBe("ended");
    expect(parseAdminRoomsScope("all")).toBe("all");
    expect(parseAdminRoomsScope("unknown")).toBe("active");
  });
});
