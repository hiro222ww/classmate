import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE_NAME, createAdminToken } from "./adminAuth";
import { OPS_TEST_COOKIE_NAME, createOpsTestToken } from "./opsTestMode";

vi.mock("@/lib/admissionWindow", () => ({
  getAdmissionStatus: vi.fn(async () => ({
    open: false,
    text: "ただいま入学受付時間外です",
    enabled: true,
    start: "21:00",
    end: "21:30",
  })),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {},
}));

vi.mock("@/lib/actorIdentity", () => ({
  hasClassMembershipForActor: vi.fn(async () => false),
}));

import { blockNewJoinIfAdmissionClosed } from "./admissionMembership";
import { getAdmissionStatus } from "./admissionWindow";

const ORIGINAL_PASSWORD = process.env.ADMIN_PASSWORD;

describe("admission ops-test bypass", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "test-admin-secret";
    vi.mocked(getAdmissionStatus).mockClear();
  });

  afterEach(() => {
    if (ORIGINAL_PASSWORD === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = ORIGINAL_PASSWORD;
    }
  });

  it("blocks when ignoreAdmission is off even if other flags are on", async () => {
    const admin = createAdminToken();
    const ops = createOpsTestToken({
      ignoreAdmission: false,
      ignoreAge: true,
      allowMinorProfile: true,
      ignoreRecruitment: true,
    });
    const blocked = await blockNewJoinIfAdmissionClosed({
      deviceId: "11111111-1111-4111-8111-111111111111",
      classId: "22222222-2222-4222-8222-222222222222",
      req: new Request("http://localhost/api/class/match-join-v2", {
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${admin}; ${OPS_TEST_COOKIE_NAME}=${ops}`,
        },
      }),
    });
    expect(blocked?.status).toBe(403);
    expect(getAdmissionStatus).toHaveBeenCalled();
  });

  it("allows only when admin + ignoreAdmission", async () => {
    const admin = createAdminToken();
    const ops = createOpsTestToken({
      ignoreAdmission: true,
      ignoreAge: false,
      allowMinorProfile: false,
      ignoreRecruitment: false,
    });
    const blocked = await blockNewJoinIfAdmissionClosed({
      deviceId: "11111111-1111-4111-8111-111111111111",
      classId: "22222222-2222-4222-8222-222222222222",
      req: new Request("http://localhost/api/class/match-join-v2", {
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${admin}; ${OPS_TEST_COOKIE_NAME}=${ops}`,
        },
      }),
    });
    expect(blocked).toBeNull();
    expect(getAdmissionStatus).not.toHaveBeenCalled();
  });

  it("ops cookie alone never bypasses after admin session ends", async () => {
    const ops = createOpsTestToken({
      ignoreAdmission: true,
      ignoreAge: true,
      allowMinorProfile: true,
      ignoreRecruitment: true,
    });
    const blocked = await blockNewJoinIfAdmissionClosed({
      deviceId: "11111111-1111-4111-8111-111111111111",
      classId: "22222222-2222-4222-8222-222222222222",
      req: new Request("http://localhost/api/class/match-join-v2", {
        headers: { cookie: `${OPS_TEST_COOKIE_NAME}=${ops}` },
      }),
    });
    expect(blocked?.status).toBe(403);
  });
});
