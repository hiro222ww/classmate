"use client";

import type { CSSProperties } from "react";
import { LoadSpinner } from "@/components/LoadStateUI";

export type InvitePrepStageId =
  | "invite_link"
  | "account"
  | "joining"
  | "opening";

const STAGES: Array<{ id: InvitePrepStageId; label: string }> = [
  { id: "invite_link", label: "招待リンクを確認しています" },
  { id: "account", label: "アカウント情報を確認しています" },
  { id: "joining", label: "クラスへ参加しています" },
  { id: "opening", label: "ルームを開いています" },
];

const ORDER: InvitePrepStageId[] = STAGES.map((s) => s.id);

function stageIndex(stage: InvitePrepStageId | "done" | "error" | "idle") {
  if (stage === "done") return ORDER.length;
  if (stage === "idle" || stage === "error") return -1;
  return ORDER.indexOf(stage);
}

type Props = {
  stage: InvitePrepStageId | "done" | "error" | "idle";
  classLabel?: string | null;
  inviterName?: string | null;
  slow?: boolean;
  verySlow?: boolean;
  errorMessage?: string | null;
  inviteUrl?: string | null;
  onRetry?: () => void;
  onCopyInvite?: () => void;
  onHome?: () => void;
};

export default function InviteJoinProgress({
  stage,
  classLabel,
  inviterName,
  slow = false,
  verySlow = false,
  errorMessage = null,
  inviteUrl = null,
  onRetry,
  onCopyInvite,
  onHome,
}: Props) {
  const current = stageIndex(stage);
  const failed = stage === "error";

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        background: "#fff",
        display: "grid",
        gap: 14,
      }}
    >
      <div>
        <div style={{ fontWeight: 900, fontSize: 17, color: "#111827" }}>
          クラスへの参加を準備しています
        </div>
        <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 13, fontWeight: 700 }}>
          招待情報とプロフィールを確認しています。この画面は閉じずにお待ちください。
        </p>
      </div>

      {classLabel ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          参加先: {classLabel}
          {inviterName ? (
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>
              {inviterName}さんからの招待
            </div>
          ) : null}
        </div>
      ) : null}

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
        {STAGES.map((item, index) => {
          const done = !failed && current > index;
          const active = !failed && current === index;
          return (
            <li
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: done ? "#047857" : active ? "#111827" : "#9ca3af",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: done ? "#d1fae5" : active ? "#e5e7eb" : "#f3f4f6",
                  flexShrink: 0,
                }}
              >
                {done ? "✓" : active ? <LoadSpinner size={12} /> : index + 1}
              </span>
              {item.label}
            </li>
          );
        })}
      </ol>

      <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>
        参加処理中です。連続してボタンを押す必要はありません。
      </p>

      {slow && !failed ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "#fffbeb",
            border: "1px solid #fde68a",
            color: "#92400e",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          参加処理に少し時間がかかっています。通信状況を確認しながら処理を続けています。
        </div>
      ) : null}

      {(verySlow || failed) && (
        <div style={{ display: "grid", gap: 8 }}>
          {failed && errorMessage ? (
            <div style={{ color: "#b91c1c", fontWeight: 800, fontSize: 13 }}>
              {errorMessage}
            </div>
          ) : (
            <div style={{ color: "#92400e", fontWeight: 800, fontSize: 13 }}>
              まだ完了しない場合は、もう一度お試しいただけます。
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {onRetry ? (
              <button type="button" onClick={onRetry} style={actionBtn}>
                もう一度試す
              </button>
            ) : null}
            {onCopyInvite && inviteUrl ? (
              <button type="button" onClick={onCopyInvite} style={actionBtn}>
                招待リンクをコピー
              </button>
            ) : null}
            {onHome ? (
              <button type="button" onClick={onHome} style={ghostBtn}>
                ホームへ戻る
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

const actionBtn: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
};

const ghostBtn: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
};
