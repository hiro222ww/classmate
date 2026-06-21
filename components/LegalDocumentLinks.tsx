import type { CSSProperties } from "react";
import Link from "next/link";

const linkStyle: CSSProperties = {
  color: "#111827",
  fontWeight: 800,
  textDecoration: "underline",
};

export function LegalDocumentLinks({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <nav
      aria-label="規約・ポリシー"
      style={{
        display: "flex",
        gap: compact ? 10 : 12,
        flexWrap: "wrap",
        fontSize: compact ? 12 : 13,
        color: "#4b5563",
        lineHeight: 1.6,
      }}
    >
      <Link href="/terms" target="_blank" rel="noopener noreferrer" style={linkStyle}>
        利用規約
      </Link>
      <Link href="/privacy" target="_blank" rel="noopener noreferrer" style={linkStyle}>
        プライバシーポリシー
      </Link>
      <Link
        href="/guidelines"
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        コミュニティガイドライン
      </Link>
    </nav>
  );
}

export function LegalConsentCheckbox({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        lineHeight: 1.65,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 4 }}
      />
      <span>
        <Link href="/terms" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          利用規約
        </Link>
        、
        <Link href="/privacy" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          プライバシーポリシー
        </Link>
        、
        <Link
          href="/guidelines"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          コミュニティガイドライン
        </Link>
        に同意します
      </span>
    </label>
  );
}
