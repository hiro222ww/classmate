export type AdmissionLoadState = "loading" | "ready" | "error";

export type AdmissionJoinGateInput = {
  loadState: AdmissionLoadState;
  joinWindowOpen: boolean;
  ignoreAdmission?: boolean;
};

/** Whether voice/chat match-join CTAs may proceed (admin bypass included). */
export function canStartMatchJoin(input: AdmissionJoinGateInput): boolean {
  if (input.ignoreAdmission) return true;
  if (input.loadState !== "ready") return false;
  return input.joinWindowOpen;
}

export function isMatchJoinBlockedByAdmission(
  input: AdmissionJoinGateInput
): boolean {
  return !canStartMatchJoin(input);
}

/** User-facing closed-hours copy (API text normalized). */
export function formatAdmissionClosedNotice(
  admissionText?: string | null
): string {
  const raw = String(admissionText ?? "").trim();
  if (raw) {
    return raw
      .replace(/ただいま入学受付時間外/g, "ただいま受付時間外")
      .replace(/^入学受付時間外/g, "受付時間外");
  }

  return "ただいま受付時間外です";
}

export type AdmissionStatusNotice = {
  kind: "loading" | "error" | "closed";
  text: string;
};

export function resolveAdmissionStatusNotice(params: {
  loadState: AdmissionLoadState;
  joinWindowOpen: boolean;
  admissionText?: string | null;
}): AdmissionStatusNotice | null {
  if (params.loadState === "loading") {
    return { kind: "loading", text: "受付状況を確認中…" };
  }

  if (params.loadState === "error") {
    return { kind: "error", text: "受付状況を確認できませんでした" };
  }

  if (!params.joinWindowOpen) {
    return {
      kind: "closed",
      text: formatAdmissionClosedNotice(params.admissionText),
    };
  }

  return null;
}

/** Header pill label while loading / error / open / closed. */
export function resolveAdmissionStatusPillText(params: {
  loadState: AdmissionLoadState;
  joinWindowOpen: boolean;
  admissionText?: string | null;
}): string | null {
  if (params.loadState === "loading") {
    return "受付状況を確認中…";
  }

  if (params.loadState === "error") {
    return "受付状況を確認できませんでした";
  }

  const raw = String(params.admissionText ?? "").trim();
  if (raw) return raw;
  return params.joinWindowOpen ? "入学受付中" : "入学受付時間外";
}

/**
 * Client-side guard before calling match-join. Returns true when join may proceed.
 */
export function guardMatchJoinAdmission(
  input: AdmissionJoinGateInput
): boolean {
  return canStartMatchJoin(input);
}

/** @deprecated Use loadState === "ready" */
export function admissionLoadStateResolved(
  loadState: AdmissionLoadState
): boolean {
  return loadState === "ready";
}
