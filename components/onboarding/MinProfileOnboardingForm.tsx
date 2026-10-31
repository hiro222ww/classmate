"use client";

import { FormEvent, useState } from "react";
import { LegalConsentCheckbox } from "@/components/LegalDocumentLinks";
import { FormFieldLabel, FormSection } from "@/components/FormFieldLabel";
import { DECLARED_AGE_MAX, DECLARED_AGE_MIN } from "@/lib/profileClient";
import { adultOnlyUserMessage } from "@/lib/agePolicyRules";

export type MinProfileFormValues = {
  displayName: string;
  declaredAge: number;
};

export type MinProfileFormValidation =
  | { ok: true; values: MinProfileFormValues }
  | { ok: false; error: string };

/** Shared client validation for live onboarding and admin preview. */
export function validateMinProfileForm(input: {
  displayName: string;
  age: string;
  legalAgreed: boolean;
}): MinProfileFormValidation {
  const name = String(input.displayName ?? "").trim();
  const declaredAge = Number(input.age);

  if (!name) {
    return { ok: false, error: "表示名を入力してください。" };
  }
  if (
    !Number.isFinite(declaredAge) ||
    declaredAge < DECLARED_AGE_MIN ||
    declaredAge > DECLARED_AGE_MAX
  ) {
    return { ok: false, error: adultOnlyUserMessage() };
  }
  if (!input.legalAgreed) {
    return { ok: false, error: "利用規約などへの同意が必要です。" };
  }

  return {
    ok: true,
    values: {
      displayName: name,
      declaredAge: Math.floor(declaredAge),
    },
  };
}

type MinProfileOnboardingFormProps = {
  /** Called after shared validation succeeds. Parent owns save vs preview. */
  onValidSubmit: (values: MinProfileFormValues) => void | Promise<void>;
  submitLabel?: string;
  busyLabel?: string;
  /** When true, submit stays disabled (e.g. live flow waiting for deviceId). */
  submitDisabled?: boolean;
  initialDisplayName?: string;
  initialAge?: string;
};

export function MinProfileOnboardingForm({
  onValidSubmit,
  submitLabel = "ホームへ進む",
  busyLabel = "保存中…",
  submitDisabled = false,
  initialDisplayName = "",
  initialAge = "",
}: MinProfileOnboardingFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [age, setAge] = useState(initialAge);
  const [legalAgreed, setLegalAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || submitDisabled) return;
    setError(null);

    const validated = validateMinProfileForm({
      displayName,
      age,
      legalAgreed,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    setBusy(true);
    try {
      await onValidSubmit(validated.values);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "保存に失敗しました。通信環境を確認して再試行してください。"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="cm-classroom-scope cm-auth-root"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "20px 16px",
        background:
          "radial-gradient(700px 280px at 12% 0%, rgba(231,242,255,0.9), transparent 58%), linear-gradient(180deg, #f8faff 0%, #fff7f2 100%)",
      }}
    >
      <form
        onSubmit={(e) => void onSubmit(e)}
        style={{
          width: "min(400px, 100%)",
          display: "grid",
          gap: 14,
        }}
      >
        <header className="cm-auth-header cm-page-heading">
          <h1>はじめる</h1>
          <p className="cm-auth-lead">
            表示名と年齢だけで、最大5人の通話に参加できます。
          </p>
        </header>

        <FormSection
          title="基本情報"
          helpLabel="基本情報"
          helpContent="表示名と現在の年齢だけを登録します。生年月日は不要です。"
        >
          <FormFieldLabel>表示名</FormFieldLabel>
          <input
            id="min-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            required
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10 }}
          />
          <FormFieldLabel>年齢</FormFieldLabel>
          <input
            id="min-age"
            type="number"
            inputMode="numeric"
            min={DECLARED_AGE_MIN}
            max={DECLARED_AGE_MAX}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            required
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10 }}
          />
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            {DECLARED_AGE_MIN}
            歳以上の方がご利用いただけます。
          </p>
        </FormSection>

        <FormSection
          title="同意"
          helpLabel="同意"
          helpContent="利用規約・プライバシーポリシー・コミュニティガイドラインへの同意が必要です。"
        >
          <LegalConsentCheckbox checked={legalAgreed} onChange={setLegalAgreed} />
        </FormSection>

        {error ? (
          <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy || submitDisabled}
          className="cm-cta-primary"
          style={{
            padding: "12px 16px",
            borderRadius: 14,
            border: "none",
            background: "var(--cm-primary-bg)",
            color: "#fff",
            fontWeight: 800,
            cursor: busy ? "wait" : "pointer",
            opacity: busy || submitDisabled ? 0.7 : 1,
            minHeight: 48,
            boxShadow: "var(--cm-primary-shadow)",
          }}
        >
          {busy ? busyLabel : submitLabel}
        </button>
      </form>
    </main>
  );
}
