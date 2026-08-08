/** Client-safe ops test flag helpers (no Node crypto / cookie signing). */

export const OPS_TEST_COOKIE_NAME = "classmate_ops_test";

export type OpsTestFlags = {
  ignoreAdmission: boolean;
  /** Admin's own join / topic / matching age checks only. */
  ignoreAge: boolean;
  /** Admin's own profile-save age checks only. */
  allowMinorProfile: boolean;
  ignoreRecruitment: boolean;
};

export const DEFAULT_OPS_TEST_FLAGS: OpsTestFlags = {
  ignoreAdmission: false,
  ignoreAge: false,
  allowMinorProfile: false,
  ignoreRecruitment: false,
};

export function normalizeOpsTestFlags(input: unknown): OpsTestFlags {
  const src =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  return {
    ignoreAdmission: src.ignoreAdmission === true,
    ignoreAge: src.ignoreAge === true,
    allowMinorProfile: src.allowMinorProfile === true,
    ignoreRecruitment: src.ignoreRecruitment === true,
  };
}

export function anyOpsTestFlagEnabled(flags: OpsTestFlags): boolean {
  return (
    flags.ignoreAdmission ||
    flags.ignoreAge ||
    flags.allowMinorProfile ||
    flags.ignoreRecruitment
  );
}

/** Join / topic / matching age gates for the admin's own request. */
export function shouldBypassJoinAgeGates(flags: OpsTestFlags): boolean {
  return flags.ignoreAge === true;
}

/** Profile POST age gates for the admin's own save request. */
export function shouldBypassProfileAgeGates(flags: OpsTestFlags): boolean {
  return flags.allowMinorProfile === true;
}

/** Deadline / TTL / accepting_new_users only — never terminal sessions. */
export function shouldBypassRecruitmentTimeGates(flags: OpsTestFlags): boolean {
  return flags.ignoreRecruitment === true;
}
