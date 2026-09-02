export type AdmissionJoinGateInput = {
  /** True after /api/admission/status has settled (success or fail-open). */
  admissionResolved: boolean;
  joinWindowOpen: boolean;
  ignoreAdmission?: boolean;
};

/** Whether voice/chat match-join CTAs may proceed (admin bypass included). */
export function canStartMatchJoin(input: AdmissionJoinGateInput): boolean {
  if (input.ignoreAdmission) return true;
  if (!input.admissionResolved) return false;
  return input.joinWindowOpen;
}

export function isMatchJoinBlockedByAdmission(
  input: AdmissionJoinGateInput
): boolean {
  return !canStartMatchJoin(input);
}

/** User-facing closed-hours copy (API text normalized). */
export function formatAdmissionClosedNotice(
  joinWindowOpen: boolean,
  admissionText?: string | null
): string | null {
  if (joinWindowOpen) return null;

  const raw = String(admissionText ?? "").trim();
  if (raw) {
    return raw
      .replace(/ただいま入学受付時間外/g, "ただいま受付時間外")
      .replace(/^入学受付時間外/g, "受付時間外");
  }

  return "ただいま受付時間外です";
}

/**
 * Client-side guard before calling match-join. Returns true when join may proceed.
 */
export function guardMatchJoinAdmission(
  input: AdmissionJoinGateInput
): boolean {
  return canStartMatchJoin(input);
}
