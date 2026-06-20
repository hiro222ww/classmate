import { NextResponse } from "next/server";
import {
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

export async function enforceDeviceJoinAge(
  deviceId: string
): Promise<JoinAgeGuardResult> {
  const mode = await getEffectiveAgeMode();
  const age = await getProfileAge(deviceId);
  const check = checkSelfAgeForJoin(age, mode);

  if (!check.ok) {
    return {
      ok: false,
      error: check.error,
      message: check.message,
      age,
      mode,
    };
  }

  return { ok: true, age, mode };
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
