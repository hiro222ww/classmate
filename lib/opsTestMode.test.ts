import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_COOKIE_NAME, createAdminToken } from "./adminAuth";
import {
  OPS_TEST_COOKIE_NAME,
  createOpsTestToken,
  resolveOpsTestFlags,
  verifyOpsTestToken,
} from "./opsTestMode";
import {
  DEFAULT_OPS_TEST_FLAGS,
  shouldBypassJoinAgeGates,
  shouldBypassProfileAgeGates,
  shouldBypassRecruitmentTimeGates,
} from "./opsTestModeShared";
import {
  blocksNewJoinSessionStatus,
  isDeadlinePassed,
  isSessionEligibleForNormalJoin,
  isTerminalSessionStatus,
} from "./recruitment";
import { checkSelfAgeForJoin } from "./agePolicyRules";

const ORIGINAL_PASSWORD = process.env.ADMIN_PASSWORD;

describe("opsTestMode flags", () => {
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

  it("keeps ignoreAge and allowMinorProfile independent", () => {
    const ageOnly = createOpsTestToken({
      ignoreAdmission: false,
      ignoreAge: true,
      allowMinorProfile: false,
      ignoreRecruitment: false,
    });
    expect(verifyOpsTestToken(ageOnly)).toEqual({
      ignoreAdmission: false,
      ignoreAge: true,
      allowMinorProfile: false,
      ignoreRecruitment: false,
    });

    const minorOnly = createOpsTestToken({
      ignoreAdmission: false,
      ignoreAge: false,
      allowMinorProfile: true,
      ignoreRecruitment: false,
    });
    expect(verifyOpsTestToken(minorOnly)).toEqual({
      ignoreAdmission: false,
      ignoreAge: false,
      allowMinorProfile: true,
      ignoreRecruitment: false,
    });
  });

  it("ignores ops cookie when admin session is missing", () => {
    const ops = createOpsTestToken({
      ignoreAdmission: true,
      ignoreAge: true,
      allowMinorProfile: true,
      ignoreRecruitment: true,
    });
    const req = new Request("http://localhost/api/class/match-join-v2", {
      headers: { cookie: `${OPS_TEST_COOKIE_NAME}=${ops}` },
    });
    expect(resolveOpsTestFlags(req)).toEqual(DEFAULT_OPS_TEST_FLAGS);
  });

  it("applies ops flags only with a valid admin session", () => {
    const admin = createAdminToken();
    const ops = createOpsTestToken({
      ignoreAdmission: true,
      ignoreAge: false,
      allowMinorProfile: true,
      ignoreRecruitment: false,
    });
    const req = new Request("http://localhost/api/profile", {
      headers: {
        cookie: `${ADMIN_COOKIE_NAME}=${admin}; ${OPS_TEST_COOKIE_NAME}=${ops}`,
      },
    });
    expect(resolveOpsTestFlags(req)).toEqual({
      ignoreAdmission: true,
      ignoreAge: false,
      allowMinorProfile: true,
      ignoreRecruitment: false,
    });
  });
});

describe("ops age gate semantics", () => {
  it("allowMinorProfile ON / ignoreAge OFF → profile only", () => {
    const flags = {
      ignoreAdmission: false,
      ignoreAge: false,
      allowMinorProfile: true,
      ignoreRecruitment: false,
    };
    expect(shouldBypassProfileAgeGates(flags)).toBe(true);
    expect(shouldBypassJoinAgeGates(flags)).toBe(false);
    expect(checkSelfAgeForJoin(16, "post_high_school_only").ok).toBe(false);
  });

  it("ignoreAge ON / allowMinorProfile OFF → join only", () => {
    const flags = {
      ignoreAdmission: false,
      ignoreAge: true,
      allowMinorProfile: false,
      ignoreRecruitment: false,
    };
    expect(shouldBypassJoinAgeGates(flags)).toBe(true);
    expect(shouldBypassProfileAgeGates(flags)).toBe(false);
  });

  it("does not rewrite global age mode behavior for other users", () => {
    const otherUserReq = new Request("http://localhost/api/class/match-join-v2");
    expect(resolveOpsTestFlags(otherUserReq)).toEqual(DEFAULT_OPS_TEST_FLAGS);
    expect(shouldBypassJoinAgeGates(DEFAULT_OPS_TEST_FLAGS)).toBe(false);
    expect(checkSelfAgeForJoin(16, "post_high_school_only").ok).toBe(false);
  });
});

describe("ops recruitment bypass scope", () => {
  it("still treats closed/expired/ended as terminal", () => {
    expect(isTerminalSessionStatus("closed")).toBe(true);
    expect(isTerminalSessionStatus("expired")).toBe(true);
    expect(isTerminalSessionStatus("ended")).toBe(true);
    expect(isTerminalSessionStatus("forming")).toBe(false);
    expect(blocksNewJoinSessionStatus("closed")).toBe(true);
    expect(blocksNewJoinSessionStatus("active")).toBe(true);
    expect(blocksNewJoinSessionStatus("forming")).toBe(false);
  });

  it("time gates remain the only recruitment bypass targets", () => {
    const flags = {
      ignoreAdmission: false,
      ignoreAge: false,
      allowMinorProfile: false,
      ignoreRecruitment: true,
    };
    expect(shouldBypassRecruitmentTimeGates(flags)).toBe(true);

    const staleCreatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(
      isDeadlinePassed(new Date(Date.now() - 1000).toISOString())
    ).toBe(true);
    expect(
      isSessionEligibleForNormalJoin({
        sessionStatus: "forming",
        sessionCreatedAt: staleCreatedAt,
        recruitmentSessionTtlMinutes: 5,
      })
    ).toBe(false);

    // Terminal / active sessions stay blocked even when time bypass is on.
    expect(blocksNewJoinSessionStatus("closed")).toBe(true);
    expect(blocksNewJoinSessionStatus("expired")).toBe(true);
    expect(blocksNewJoinSessionStatus("active")).toBe(true);
    expect(isTerminalSessionStatus("ended")).toBe(true);
  });
});
