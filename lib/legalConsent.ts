export const CURRENT_LEGAL_CONSENT_VERSION = "2026-06-10";

export type LegalConsentFields = {
  terms_agreed_at?: string | null;
  privacy_agreed_at?: string | null;
  guidelines_agreed_at?: string | null;
  legal_consent_version?: string | null;
};

export type LegalConsentStatus = {
  valid: boolean;
  needs_reconsent: boolean;
  version: string | null;
  terms_agreed_at: string | null;
  privacy_agreed_at: string | null;
  guidelines_agreed_at: string | null;
};

export function hasValidLegalConsent(
  record: LegalConsentFields | null | undefined
): boolean {
  if (!record) return false;

  const version = String(record.legal_consent_version ?? "").trim();
  if (version !== CURRENT_LEGAL_CONSENT_VERSION) return false;

  return Boolean(
    record.terms_agreed_at &&
      record.privacy_agreed_at &&
      record.guidelines_agreed_at
  );
}

export function buildLegalConsentStatus(
  record: LegalConsentFields | null | undefined
): LegalConsentStatus {
  const valid = hasValidLegalConsent(record);
  return {
    valid,
    needs_reconsent: !valid,
    version: record?.legal_consent_version ?? null,
    terms_agreed_at: record?.terms_agreed_at ?? null,
    privacy_agreed_at: record?.privacy_agreed_at ?? null,
    guidelines_agreed_at: record?.guidelines_agreed_at ?? null,
  };
}

export function buildLegalConsentPayload(now = new Date().toISOString()) {
  return {
    terms_agreed_at: now,
    privacy_agreed_at: now,
    guidelines_agreed_at: now,
    legal_consent_version: CURRENT_LEGAL_CONSENT_VERSION,
  };
}

export function parseLegalAgreementFlag(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}
