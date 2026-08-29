"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { LegalConsentCheckbox } from "@/components/LegalDocumentLinks";
import { FormFieldLabel, FormSection } from "@/components/FormFieldLabel";
import { DECLARED_AGE_MAX, DECLARED_AGE_MIN } from "@/lib/profileClient";
import { adultOnlyUserMessage } from "@/lib/agePolicyRules";
import { trackFunnelEvent } from "@/lib/funnelEvents";
import { sanitizeReturnTo } from "@/lib/profileNavigation";
import { withDev } from "@/lib/withDev";

export function MinProfileOnboardingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeReturnTo(
    searchParams.get("next") ?? searchParams.get("returnTo") ?? "/"
  );
  const [deviceId, setDeviceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [legalAgreed, setLegalAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    const name = displayName.trim();
    const declaredAge = Number(age);
    if (!name) {
      setError("表示名を入力してください。");
      return;
    }
    if (
      !Number.isFinite(declaredAge) ||
      declaredAge < DECLARED_AGE_MIN ||
      declaredAge > DECLARED_AGE_MAX
    ) {
      setError(adultOnlyUserMessage());
      return;
    }
    if (!legalAgreed) {
      setError("利用規約などへの同意が必要です。");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("mode", "minimum");
      form.append("device_id", deviceId);
      form.append("display_name", name);
      form.append("declared_age", String(Math.floor(declaredAge)));
      form.append("terms_agreed", "true");
      form.append("privacy_agreed", "true");
      form.append("guidelines_agreed", "true");

      const res = await authenticatedFetch("/api/profile", {
        method: "POST",
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(
          String(json?.message ?? json?.error ?? "保存に失敗しました。")
        );
        return;
      }

      void trackFunnelEvent({
        eventName: "min_profile_saved",
        deviceId,
      });

      router.replace(withDev(nextPath));
      router.refresh();
    } catch {
      setError("保存に失敗しました。通信環境を確認して再試行してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "linear-gradient(180deg, #f7fafc 0%, #eef4f8 100%)",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "min(420px, 100%)",
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>はじめる</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6b7280" }}>
            表示名と年齢だけで、最大5人の通話に参加できます。
          </p>
        </div>

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
          disabled={busy || !deviceId}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            background: "#2f9e6b",
            color: "#fff",
            fontWeight: 800,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "保存中…" : "ホームへ進む"}
        </button>
      </form>
    </main>
  );
}
