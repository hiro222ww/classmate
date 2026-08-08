import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const ORIGINAL_PASSWORD = process.env.ADMIN_PASSWORD;

describe("GET /api/admin/profiles auth", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "test-admin-secret";
  });

  afterEach(() => {
    if (ORIGINAL_PASSWORD === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = ORIGINAL_PASSWORD;
    }
  });

  it("returns 401 for non-admin requests", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/profiles", {
        headers: { cookie: "foo=bar" },
      })
    );
    expect(res.status).toBe(401);
  });
});
