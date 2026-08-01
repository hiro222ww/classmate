"use client";

import MemberListAvatar from "@/components/MemberListAvatar";
import CallPresenceToastStack from "@/components/call/CallPresenceToastStack";
import type { CallPresenceToast } from "@/lib/callPresenceToasts";
import { LIST_MEMBER_AVATAR_PX } from "@/lib/memberProfileView";
import { isAppShellContext } from "@/lib/appShellContext";
import type { CallDemoBoard, CallDemoMember, CallDemoUiScene } from "@/lib/callDemo/types";
import { CALL_DEMO_SPEAKING_MS } from "@/lib/callDemo/defaults";

export type CallRoomStageMember = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  photoPath?: string | null;
  isSelf?: boolean;
  speaking?: boolean;
  lastSpokeAt?: number | null;
  statusText: string;
  muted?: boolean;
  listenOnly?: boolean;
  genderLabel?: string;
  ageLabel?: string;
};

function sceneBanner(scene: CallDemoUiScene): string | null {
  if (scene === "connecting") return "接続中…";
  if (scene === "reconnecting") return "再接続中…";
  if (scene === "waiting") return "他の参加者の参加を待っています。";
  if (scene === "class_just_started") return "クラスが始まりました";
  if (scene === "call_ended") return "通話が終了しました";
  if (scene === "exit_confirm") return "通話を終了しますか？";
  return null;
}

function memberChipText(member: CallRoomStageMember, nowMs: number): string {
  const speaking =
    member.speaking === true ||
    (!!member.lastSpokeAt && nowMs - member.lastSpokeAt < CALL_DEMO_SPEAKING_MS);
  if (speaking) return "発話中";
  if (member.listenOnly) return "聞き専";
  if (member.muted) return "ミュート";
  return member.statusText;
}

export default function CallRoomStage({
  title = "通話ルーム",
  filled,
  capacity,
  members,
  toasts,
  board,
  uiScene = "connected",
  showDemoBadge = false,
  selfMuted = false,
  selfListenOnly = false,
  micLevel = 0,
  muteButtonLabel,
  onMuteClick,
  showExitConfirm = false,
  onConfirmExit,
  onCancelExit,
  nowMs,
}: {
  title?: string;
  filled: number;
  capacity: number;
  members: CallRoomStageMember[];
  toasts: CallPresenceToast[];
  board?: CallDemoBoard | null;
  uiScene?: CallDemoUiScene;
  showDemoBadge?: boolean;
  selfMuted?: boolean;
  selfListenOnly?: boolean;
  micLevel?: number;
  muteButtonLabel: string;
  onMuteClick?: () => void;
  showExitConfirm?: boolean;
  onConfirmExit?: () => void;
  onCancelExit?: () => void;
  nowMs: number;
}) {
  const isApp = isAppShellContext();
  const banner = sceneBanner(uiScene);
  const slots = Math.max(capacity, members.length, 1);

  return (
    <main
      className={isApp ? "app-immersive-inner app-immersive-inner--wide" : undefined}
      style={isApp ? undefined : { maxWidth: 1100, margin: "0 auto", padding: 16 }}
    >
      <CallPresenceToastStack toasts={toasts} />

      {showDemoBadge ? (
        <div
          style={{
            display: "inline-flex",
            marginBottom: 10,
            padding: "4px 10px",
            borderRadius: 999,
            background: "#111827",
            color: "#fff",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: 0.3,
          }}
        >
          撮影用デモ
        </div>
      ) : null}

      <div
        className={isApp ? "app-immersive-call-header" : undefined}
        style={
          isApp
            ? undefined
            : {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }
        }
      >
        <div>
          <h1
            className={isApp ? "app-shell-title" : undefined}
            style={isApp ? undefined : { fontSize: 24, fontWeight: 900, margin: 0 }}
          >
            {title}
          </h1>
          <div
            className={isApp ? "app-shell-subtitle" : undefined}
            style={isApp ? undefined : { marginTop: 6, fontSize: 13, color: "#666" }}
          >
            参加人数 {filled}/{capacity}
            {board?.statusText ? ` · ${board.statusText}` : null}
          </div>
          {board?.className ? (
            <div style={{ marginTop: 4, fontSize: 12, color: "#374151", fontWeight: 800 }}>
              {board.className}
              {board.conversationTheme ? ` / ${board.conversationTheme}` : ""}
            </div>
          ) : null}
        </div>
      </div>

      {banner ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: uiScene === "exit_confirm" ? "#fff7ed" : "#f9fafb",
            color: uiScene === "exit_confirm" ? "#9a3412" : "#6b7280",
            border: "1px solid #e5e7eb",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {banner}
          {showExitConfirm ? (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onConfirmExit}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #b91c1c",
                  background: "#b91c1c",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                退出する
              </button>
              <button
                type="button"
                onClick={onCancelExit}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {board?.showBoard ? (
        <section
          style={{
            marginTop: 16,
            padding: 14,
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            background:
              board.backgroundTheme === "warm"
                ? "#fff7ed"
                : board.backgroundTheme === "cool"
                  ? "#eff6ff"
                  : "#fff",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8, color: "#374151" }}>
            {board.boardTitle}
            {board.classroomTheme ? (
              <span style={{ marginLeft: 8, color: "#6b7280", fontWeight: 700 }}>
                · {board.classroomTheme}
              </span>
            ) : null}
          </div>
          <div
            style={{
              background: "#0b3b2e",
              borderRadius: 16,
              padding: "16px 16px",
              border: "2px solid #073126",
              boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)",
              color: "#e9fbe8",
              fontWeight: 900,
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              textShadow: "0 1px 0 rgba(0,0,0,0.25)",
            }}
          >
            {board.boardBody}
          </div>
        </section>
      ) : null}

      <section
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 12 }}>
          通話中のメンバー
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 12,
          }}
        >
          {Array.from({ length: slots }).map((_, i) => {
            const member = members[i];
            const isFilled = !!member;
            const isMe = member?.isSelf === true;
            const speaking =
              !!member &&
              (member.speaking === true ||
                (!!member.lastSpokeAt &&
                  nowMs - member.lastSpokeAt < CALL_DEMO_SPEAKING_MS));
            const chip = member
              ? memberChipText(member, nowMs)
              : "空席";

            return (
              <div
                key={member?.id ?? `empty-${i}`}
                style={{
                  minHeight: 96,
                  borderRadius: 16,
                  border: speaking ? "2px solid #22c55e" : "1px solid #e5e7eb",
                  background: isFilled ? "#ffffff" : "#f9fafb",
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  boxShadow: speaking
                    ? "0 8px 24px rgba(34,197,94,0.18)"
                    : "none",
                  transform: speaking ? "translateY(-2px)" : "none",
                  transition:
                    "transform 160ms ease, box-shadow 160ms ease, border 160ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      width: LIST_MEMBER_AVATAR_PX,
                      height: LIST_MEMBER_AVATAR_PX,
                      borderRadius: "50%",
                      background: isFilled ? "#dbeafe" : "#e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                      border: isMe ? "2px solid #22c55e" : "1px solid #d1d5db",
                    }}
                  >
                    {member ? (
                      <MemberListAvatar
                        avatarUrl={member.avatarUrl}
                        photoPath={member.photoPath}
                        label={member.displayName}
                        sizePx={LIST_MEMBER_AVATAR_PX}
                        isMe={isMe}
                        eager={i < 4}
                      />
                    ) : null}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: isFilled ? "#111827" : "#9ca3af",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {isFilled
                        ? isMe
                          ? `${member.displayName} (You)`
                          : member.displayName
                        : "空席"}
                    </div>
                    {member?.genderLabel || member?.ageLabel ? (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 11,
                          color: "#6b7280",
                          fontWeight: 700,
                        }}
                      >
                        {[member.genderLabel, member.ageLabel]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: speaking
                      ? "#dcfce7"
                      : isFilled
                        ? "#eff6ff"
                        : "#f3f4f6",
                    color: speaking
                      ? "#166534"
                      : isFilled
                        ? "#1d4ed8"
                        : "#6b7280",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {chip}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 15 }}>音声設定</div>
        {selfListenOnly ? (
          <div style={{ marginTop: 8, fontSize: 12, color: "#92400e", fontWeight: 800 }}>
            聞き専モード（デモ表示）
          </div>
        ) : null}
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            disabled={selfListenOnly}
            onClick={onMuteClick}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: selfMuted ? "#fff" : "#111827",
              color: selfMuted ? "#111827" : "#fff",
              fontWeight: 900,
              cursor: selfListenOnly ? "not-allowed" : "pointer",
              opacity: selfListenOnly ? 0.6 : 1,
            }}
          >
            {muteButtonLabel}
          </button>
          <div style={{ fontSize: 12, color: "#374151", minWidth: 180 }}>
            マイク入力: {(micLevel * 100).toFixed(1)}
          </div>
          <div
            style={{
              width: 140,
              height: 10,
              borderRadius: 999,
              background: "#e5e7eb",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, micLevel * 800)}%`,
                height: "100%",
                background: "#111827",
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
