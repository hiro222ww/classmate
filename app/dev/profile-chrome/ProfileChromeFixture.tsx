"use client";

import { useSearchParams } from "next/navigation";
import {
  FormFieldLabel,
  FormSection,
  SectionTitle,
} from "@/components/FormFieldLabel";
import { HelpTip } from "@/components/HelpTip";
import { LegalConsentCheckbox } from "@/components/LegalDocumentLinks";
import { adultOnlyUserMessage } from "@/lib/agePolicyRules";

export type ProfileChromeScene =
  | "empty"
  | "filled"
  | "validation"
  | "saving"
  | "success"
  | "error"
  | "minor"
  | "legal";

/**
 * Presentational profile chrome for local screenshots.
 * Dummy state only — no API / Auth / storage writes.
 */
export default function ProfileChromeFixture() {
  const searchParams = useSearchParams();
  const scene = (searchParams.get("scene") as ProfileChromeScene) || "filled";

  const empty = scene === "empty" || scene === "legal";
  const displayName = empty ? "" : "たろう";
  const birthDate = scene === "minor" ? "2012-04-01" : empty ? "" : "1995-06-15";
  const gender = empty ? "" : "male";
  const hobbies = empty ? "" : "読書、散歩";
  const bio = empty ? "" : "はじめまして。よろしくお願いします。";
  const showAge = true;
  const legalAgreed = scene !== "legal" && scene !== "empty";
  const needsLegal = scene === "legal" || scene === "empty";
  const submitting = scene === "saving";
  const errorMsg =
    scene === "validation"
      ? "ニックネームを入力してください。"
      : scene === "error"
        ? "保存に失敗しました。サーバー側で保存に失敗しました。"
        : "";
  const canSubmit =
    !submitting &&
    scene !== "empty" &&
    scene !== "legal" &&
    scene !== "validation" &&
    scene !== "error" &&
    scene !== "minor";

  return (
    <main
      className="cm-classroom-scope cm-profile-root"
      style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}
    >
      <form className="cm-profile-form" style={{ display: "grid", gap: 16 }}>
        <SectionTitle
          title={scene === "empty" || scene === "legal" ? "プロフィール登録" : "プロフィール編集"}
          helpLabel="プロフィールについて"
          helpContent="ニックネーム・生年月日・性別を登録すると、クラスに参加できます。"
        />

        {scene === "success" ? (
          <p
            className="cm-profile-status cm-profile-status--ok"
            style={{ margin: 0, color: "#166534", fontWeight: 700 }}
          >
            プロフィールを保存しました
          </p>
        ) : null}

        {errorMsg ? (
          <div
            className="cm-home-error cm-profile-error"
            style={{
              padding: 10,
              border: "1px solid #f5c2c7",
              background: "#f8d7da",
              borderRadius: 10,
            }}
          >
            <p style={{ margin: 0, color: "#842029" }}>{errorMsg}</p>
          </div>
        ) : null}

        <FormSection
          title="基本情報"
          helpLabel="基本情報について"
          helpContent="クラス参加に必要な項目です。"
        >
          <div style={{ display: "grid", gap: 6 }}>
            <FormFieldLabel>ニックネーム（必須）</FormFieldLabel>
            <input
              className="cm-form-input"
              value={displayName}
              readOnly
              placeholder="例：たろう"
              style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <FormFieldLabel>生年月日（必須）</FormFieldLabel>
            <input
              className="cm-form-input"
              type="date"
              value={birthDate}
              readOnly
              style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
            />
            {birthDate ? (
              <p
                className="cm-profile-age"
                style={{ margin: 0, fontWeight: 700, color: "#374151" }}
              >
                年齢：{scene === "minor" ? "14" : "30"}歳
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
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <FormFieldLabel>性別（必須）</FormFieldLabel>
            <select
              className="cm-form-input"
              value={gender}
              disabled
              style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
            >
              <option value="">選択してください</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
          </div>
        </FormSection>

        <FormSection
          title="プロフィール詳細"
          helpLabel="プロフィール詳細について"
          helpContent="任意の項目です。"
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
            }}
          >
            <input type="checkbox" checked={showAge} readOnly />
            <span>プロフィールに年齢を表示する</span>
          </label>

          <div style={{ display: "grid", gap: 6 }}>
            <FormFieldLabel>趣味（任意）</FormFieldLabel>
            <textarea
              className="cm-form-input"
              value={hobbies}
              readOnly
              rows={3}
              style={{
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 8,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <FormFieldLabel>ひとこと / 自己紹介（任意）</FormFieldLabel>
            <textarea
              className="cm-form-input"
              value={bio}
              readOnly
              rows={4}
              style={{
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 8,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <FormFieldLabel>プロフィール写真（任意）</FormFieldLabel>
            <img
              className="cm-profile-avatar"
              src="/default-avatar.jpg"
              alt="preview"
              style={{
                width: 120,
                height: 120,
                objectFit: "cover",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "#f3f4f6",
              }}
            />
          </div>
        </FormSection>

        {needsLegal ? (
          <FormSection
            title="規約・ポリシー"
            helpLabel="規約・ポリシーについて"
            helpContent="利用規約とプライバシーポリシーへの同意が必要です。"
          >
            <LegalConsentCheckbox
              checked={legalAgreed}
              onChange={() => undefined}
            />
          </FormSection>
        ) : null}

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
      </form>
    </main>
  );
}
