"use client";

import type { CSSProperties } from "react";
import type {
  CallDemoMember,
  CallDemoPresetId,
  CallDemoState,
  CallDemoUiScene,
} from "@/lib/callDemo/types";
import { PRESET_LABELS } from "@/lib/callDemo/defaults";

const panel: CSSProperties = {
  position: "fixed",
  right: 12,
  bottom: 12,
  zIndex: 12000,
  width: "min(420px, calc(100vw - 24px))",
  maxHeight: "min(78vh, 720px)",
  overflow: "auto",
  background: "rgba(17,24,39,0.96)",
  color: "#f9fafb",
  borderRadius: 16,
  border: "1px solid #374151",
  boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
  padding: 14,
  fontSize: 12,
};

const btn: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid #4b5563",
  background: "#1f2937",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 11,
};

const input: CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid #4b5563",
  background: "#111827",
  color: "#fff",
  fontSize: 12,
};

const SCENES: { id: CallDemoUiScene; label: string }[] = [
  { id: "connected", label: "通話接続済み" },
  { id: "connecting", label: "接続中" },
  { id: "reconnecting", label: "再接続中" },
  { id: "mic_off", label: "マイクOFF" },
  { id: "listen_only", label: "聞き専" },
  { id: "exit_confirm", label: "退出確認" },
  { id: "member_join", label: "メンバー追加" },
  { id: "member_leave", label: "メンバー退出" },
  { id: "waiting", label: "待機中" },
  { id: "class_just_started", label: "クラス開始直後" },
  { id: "call_ended", label: "通話終了後" },
];

export default function CallDemoControlPanel({
  state,
  onChange,
  onPreset,
  onReset,
  onPlayJoinToast,
  onPlayLeaveToast,
  onJoinMember,
  onLeaveMember,
  onMoveToCall,
  onMoveToWaiting,
  onClearSpeaking,
  onCycleSpeak,
}: {
  state: CallDemoState;
  onChange: (next: CallDemoState) => void;
  onPreset: (id: CallDemoPresetId) => void;
  onReset: () => void;
  onPlayJoinToast: () => void;
  onPlayLeaveToast: () => void;
  onJoinMember: () => void;
  onLeaveMember: () => void;
  onMoveToCall: () => void;
  onMoveToWaiting: () => void;
  onClearSpeaking: () => void;
  onCycleSpeak: (delta: number) => void;
}) {
  const patch = (partial: Partial<CallDemoState>) =>
    onChange({ ...state, ...partial });

  const patchMember = (index: number, partial: Partial<CallDemoMember>) => {
    const members = state.members.map((m, i) =>
      i === index ? { ...m, ...partial } : m
    );
    onChange({ ...state, members });
  };

  const setSelfExclusive = (index: number) => {
    const members = state.members.map((m, i) => ({
      ...m,
      isSelf: i === index,
    }));
    onChange({ ...state, members });
  };

  return (
    <aside style={panel} data-call-demo-panel="1">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>撮影コントロール</strong>
        <button
          type="button"
          style={btn}
          onClick={() => patch({ filmingMode: true })}
        >
          撮影モード ON
        </button>
      </div>
      <div style={{ marginTop: 6, color: "#9ca3af", lineHeight: 1.5 }}>
        D:撮影モード切替（再表示もD） / 1-5:人数 / Space:自動発話 / ←→:発話者 /
        T:トースト。入力中はショートカット無効。
      </div>

      <section style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800 }}>プリセット</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(Object.keys(PRESET_LABELS) as CallDemoPresetId[]).map((id) => (
            <button key={id} type="button" style={btn} onClick={() => onPreset(id)}>
              {PRESET_LABELS[id]}
            </button>
          ))}
          <button type="button" style={btn} onClick={onReset}>
            初期状態に戻す
          </button>
        </div>
      </section>

      <section style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800 }}>人数 · 発話</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              style={{
                ...btn,
                background: state.memberCount === n ? "#2563eb" : btn.background,
              }}
              onClick={() => patch({ memberCount: n })}
            >
              {n}人
            </button>
          ))}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={state.autoSpeak}
            onChange={(e) => patch({ autoSpeak: e.target.checked })}
          />
          自動発話切り替え
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          間隔 (ms)
          <input
            type="number"
            min={800}
            max={10000}
            step={100}
            value={state.autoSpeakIntervalMs}
            style={input}
            onChange={(e) =>
              patch({ autoSpeakIntervalMs: Number(e.target.value) || 2500 })
            }
          />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={state.dualSpeak}
            onChange={(e) => patch({ dualSpeak: e.target.checked })}
          />
          2人同時発話
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" style={btn} onClick={() => onCycleSpeak(-1)}>
            前の発話者
          </button>
          <button type="button" style={btn} onClick={() => onCycleSpeak(1)}>
            次の発話者
          </button>
          <button type="button" style={btn} onClick={onClearSpeaking}>
            発話停止
          </button>
        </div>
      </section>

      <section style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800 }}>入退室演出</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" style={btn} onClick={onJoinMember}>
            メンバー入室
          </button>
          <button type="button" style={btn} onClick={onLeaveMember}>
            メンバー退出
          </button>
          <button type="button" style={btn} onClick={onPlayJoinToast}>
            入室トースト
          </button>
          <button type="button" style={btn} onClick={onPlayLeaveToast}>
            退出トースト
          </button>
          <button type="button" style={btn} onClick={onMoveToCall}>
            待機→通話中
          </button>
          <button type="button" style={btn} onClick={onMoveToWaiting}>
            通話→待機
          </button>
        </div>
      </section>

      <section style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800 }}>UI状態</div>
        <select
          value={state.uiScene}
          style={input}
          onChange={(e) => {
            const uiScene = e.target.value as CallDemoUiScene;
            const next: Partial<CallDemoState> = { uiScene };
            if (uiScene === "mic_off") next.selfMuted = true;
            if (uiScene === "listen_only") next.selfListenOnly = true;
            if (uiScene === "connected") {
              next.selfMuted = false;
              next.selfListenOnly = false;
            }
            patch(next);
          }}
        >
          {SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={state.showDemoBadge}
            onChange={(e) => patch({ showDemoBadge: e.target.checked })}
          />
          「撮影用デモ」バッジ表示
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={state.selfMuted}
            onChange={(e) => patch({ selfMuted: e.target.checked })}
          />
          自分マイクOFF
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={state.selfListenOnly}
            onChange={(e) => patch({ selfListenOnly: e.target.checked })}
          />
          自分聞き専
        </label>
      </section>

      <section style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800 }}>黒板・教室</div>
        {(
          [
            ["className", "クラス名"],
            ["boardTitle", "黒板タイトル"],
            ["boardBody", "黒板本文"],
            ["conversationTheme", "会話テーマ"],
            ["classroomTheme", "教室テーマ"],
            ["statusText", "ステータス表示"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} style={{ display: "grid", gap: 4 }}>
            {label}
            <input
              style={input}
              value={state.board[key]}
              onChange={(e) =>
                patch({
                  board: { ...state.board, [key]: e.target.value },
                })
              }
            />
          </label>
        ))}
        <label style={{ display: "grid", gap: 4 }}>
          背景テーマ
          <select
            style={input}
            value={state.board.backgroundTheme}
            onChange={(e) =>
              patch({
                board: { ...state.board, backgroundTheme: e.target.value },
              })
            }
          >
            <option value="default">default</option>
            <option value="warm">warm</option>
            <option value="cool">cool</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={state.board.showBoard}
            onChange={(e) =>
              patch({ board: { ...state.board, showBoard: e.target.checked } })
            }
          />
          黒板表示
        </label>
      </section>

      <section style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>メンバー編集（保持スロット 1〜5）</div>
        {state.members.map((m, index) => (
          <div
            key={m.id}
            style={{
              border: "1px solid #374151",
              borderRadius: 12,
              padding: 10,
              display: "grid",
              gap: 6,
              opacity: index < state.memberCount ? 1 : 0.45,
            }}
          >
            <div style={{ fontWeight: 800 }}>
              #{index + 1} {index < state.memberCount ? "" : "(非表示)"}
            </div>
            <label style={{ display: "grid", gap: 4 }}>
              表示名
              <input
                style={input}
                value={m.displayName}
                onChange={(e) =>
                  patchMember(index, { displayName: e.target.value })
                }
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              アバターURL
              <input
                style={input}
                value={m.avatarUrl}
                onChange={(e) =>
                  patchMember(index, { avatarUrl: e.target.value })
                }
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <label style={{ display: "grid", gap: 4 }}>
                性別/属性
                <input
                  style={input}
                  value={m.genderLabel}
                  onChange={(e) =>
                    patchMember(index, { genderLabel: e.target.value })
                  }
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                年齢表示
                <input
                  style={input}
                  value={m.ageLabel}
                  onChange={(e) =>
                    patchMember(index, { ageLabel: e.target.value })
                  }
                />
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  ["muted", "ミュート"],
                  ["listenOnly", "聞き専"],
                  ["online", "オンライン"],
                  ["inCall", "通話中"],
                  ["speaking", "発話中"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={m[key]}
                    onChange={(e) =>
                      patchMember(index, { [key]: e.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
              <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="radio"
                  name="demo-self"
                  checked={m.isSelf}
                  onChange={() => setSelfExclusive(index)}
                />
                自分
              </label>
            </div>
          </div>
        ))}
      </section>
    </aside>
  );
}
