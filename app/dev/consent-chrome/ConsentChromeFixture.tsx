"use client";

import { useSearchParams } from "next/navigation";
import {
  FormSection,
  SectionTitle,
} from "@/components/FormFieldLabel";
import { LegalConsentCheckbox, LegalDocumentLinks } from "@/components/LegalDocumentLinks";
import { HelpTip } from "@/components/HelpTip";
import { adultOnlyUserMessage } from "@/lib/agePolicyRules";

export type ConsentChromeScene =
  | "needed"
  | "agreed"
  | "disabled_save"
  | "saving"
  | "success"
  | "error"
  | "loading"
  | "load_error"
  | "minor";

/**
 * Presentational consent chrome for local screenshots.
 * Reuses production LegalConsentCheckbox / LegalDocumentLinks.
 * No consent save API / DB / Auth bypass.
 */
export default function ConsentChromeFixture() {
  const searchParams = useSearchParams();
  const scene = (searchParams.get("scene") as ConsentChromeScene) || "needed";

  const agreed = scene === "agreed" || scene === "saving" || scene === "success";
  const canSubmit = scene === "agreed" || scene === "success";
  const submitting = scene === "saving";

  if (scene === "loading") {
    return (
      <main
        className="cm-classroom-scope cm-profile-root cm-consent-root"
        style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}
      >
        <p className="cm-home-loading-line">読み込み中...</p>
      </main>
    );
  }

  return (
    <main
      className="cm-classroom-scope cm-profile-root cm-consent-root"
      style={{ maxWidth: 720, margin: "0 auto", padding: 16, display: "grid", gap: 16 }}
    >
      <SectionTitle
        title="プロフィール登録"
        helpLabel="プロフィールについて"
        helpContent="ニックネーム・生年月日・性別を登録すると、クラスに参加できます。"
      />

      {scene === "load_error" ? (
        <div
          className="cm-home-error cm-profile-error"
          style={{
            padding: 10,
            border: "1px solid #f5c2c7",
            background: "#f8d7da",
            borderRadius: 10,
          }}
        >
          <p style={{ margin: 0, color: "#842029" }}>
            プロフィールの読み込みに失敗しました。時間をおいて再度お試しください。
          </p>
        </div>
      ) : null}

      {scene === "error" ? (
        <div
          className="cm-home-error cm-profile-error"
          style={{
            padding: 10,
            border: "1px solid #f5c2c7",
            background: "#f8d7da",
            borderRadius: 10,
          }}
        >
          <p style={{ margin: 0, color: "#842029" }}>
            利用規約、プライバシーポリシー、コミュニティガイドラインへの同意が必要です。
          </p>
        </div>
      ) : null}

      {scene === "success" ? (
        <p
          className="cm-profile-status cm-profile-status--ok"
          style={{ margin: 0, color: "#166534", fontWeight: 700 }}
        >
          プロフィールを保存しました
        </p>
      ) : null}

      {scene === "minor" ? (
        <div
          className="cm-home-error cm-profile-notice cm-profile-notice--danger"
          style={{
            display: "grid",
            gap: 8,
            padding: 10,
            borderRadius: 12,
            border: "1px solid #f5c2c7",
            background: "#f8d7da",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              fontWeight: 800,
              color: "#842029",
            }}
          >
            <span>{adultOnlyUserMessage()}</span>
            <HelpTip
              label="受付について"
              content="今後の運用状況に応じて受付を開始する可能性があります。"
            />
          </div>
        </div>
      ) : null}

      <FormSection
        title="規約・ポリシー"
        helpLabel="規約・ポリシーについて"
        helpContent="利用規約とプライバシーポリシーへの同意が必要です。更新があった場合は再同意が必要です。"
      >
        <div
          className="cm-consent-panel"
          data-cm-consent={agreed ? "agreed" : "needed"}
        >
          <LegalConsentCheckbox
            checked={agreed}
            onChange={() => undefined}
            disabled={submitting || scene === "disabled_save"}
          />
        </div>
        <LegalDocumentLinks />
      </FormSection>

      <div
        className="cm-profile-actions"
        style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        <button
          type="button"
          className={[
            "cm-cta-primary",
            "cm-profile-save",
            submitting ? "cm-profile-save--busy" : "",
            !canSubmit ? "cm-profile-save--disabled" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={!canSubmit}
          style={{
            padding: "10px 14px",
            border: "none",
            borderRadius: 10,
            background: canSubmit ? "#111" : "#ccc",
            color: "#fff",
            fontWeight: 800,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "保存中..." : "保存する"}
        </button>
        <button
          type="button"
          className="cm-cta-secondary cm-profile-back"
          style={{
            padding: "10px 14px",
            border: "1px solid #ccc",
            borderRadius: 10,
            background: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          戻る
        </button>
      </div>
    </main>
  );
}
