import { NextResponse } from "next/server";
import {
  checkProfileRegistrationAge,
  checkSelfAgeForJoin,
  getEffectiveAgeMode,
  getProfileAge,
  type AgePolicyErrorCode,
  type AgeMode,
} from "@/lib/agePolicy";
import { resolveMatchJoinUserMessage } from "@/lib/matchJoinUserMessage";

export type JoinAgeGuardResult =
  | { ok: true; age: number | null; mode: AgeMode }
  | {
      ok: false;
      error: AgePolicyErrorCode;
      message: string;
      age: number | null;
      mode: AgeMode;
    };

function toDeniedResult(
  check: Extract<ReturnType<typeof checkSelfAgeForJoin>, { ok: false }>,
  age: number | null,
  mode: AgeMode
): Extract<JoinAgeGuardResult, { ok: false }> {
  return {
    ok: false,
    error: check.error,
    message: check.message,
    age,
    mode,
  };
}

export async function enforceDeviceJoinAge(
  deviceId: string,
  userId?: string | null
): Promise<JoinAgeGuardResult> {
  const mode = await getEffectiveAgeMode();
  const age = await getProfileAge(deviceId, userId);
  const check = checkSelfAgeForJoin(age, mode);

  if (!check.ok) {
    return toDeniedResult(check, age, mode);
  }

  return { ok: true, age, mode };
}

export async function enforceProfileSaveAge(params: {
  age: number;
  guardianConsent?: boolean;
}): Promise<JoinAgeGuardResult> {
  const mode = await getEffectiveAgeMode();
  const check = checkProfileRegistrationAge({
    age: params.age,
    mode,
    guardianConsent: params.guardianConsent,
  });

  if (!check.ok) {
    return toDeniedResult(check, params.age, mode);
  }

  return { ok: true, age: params.age, mode };
}

export function joinAgeGuardResponse(result: Extract<JoinAgeGuardResult, { ok: false }>) {
  const status =
    result.error === "profile_age_required"
      ? 400
      : result.error === "guardian_consent_required"
        ? 403
        : 403;

  return NextResponse.json(
    {
      ok: false,
      error: result.error,
      message: result.message || resolveMatchJoinUserMessage(result.error),
    },
    { status }
  );
}
