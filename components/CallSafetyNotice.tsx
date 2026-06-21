"use client";

const STORAGE_KEY = "classmate_call_safety_ack_v1";

type Props = {
  compact?: boolean;
};

export function CallSafetyNotice({ compact = false }: Props) {
  return (
    <div
      role="note"
      aria-label="通話前の注意"
      style={{
        marginBottom: compact ? 10 : 14,
        padding: compact ? "10px 12px" : "12px 14px",
        borderRadius: 14,
        border: "1px solid #fde68a",
        background: "#fffbeb",
        color: "#92400e",
        fontSize: compact ? 12 : 13,
        lineHeight: 1.65,
        fontWeight: 700,
      }}
    >
      Classmateはテーマ別のグループ音声交流サービスです。出会い目的、連絡先交換、対面での待ち合わせ、性的な発言は禁止されています。
      {" "}
      詳細は
      <a href="/guidelines" style={{ color: "#92400e", fontWeight: 900 }}>
        コミュニティガイドライン
      </a>
      をご確認ください。
    </div>
  );
}

export function hasAcknowledgedCallSafetyNotice() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeCallSafetyNotice() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function CallSafetyAckGate({
  onAcknowledge,
}: {
  onAcknowledge: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.45)",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          borderRadius: 18,
          background: "#fff",
          padding: 20,
          boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>通話前の注意</h2>
        <CallSafetyNotice compact />
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
          困ったときは通報・ブロック機能をご利用ください。詳しくは
          <a href="/guidelines" style={{ color: "#111827", fontWeight: 800 }}>
            コミュニティガイドライン
          </a>
          をご確認ください。
        </p>
        <button
          type="button"
          onClick={onAcknowledge}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "none",
            background: "#111827",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          理解しました
        </button>
      </div>
    </div>
  );
}
