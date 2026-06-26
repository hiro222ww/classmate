"use client";

import { HelpTip } from "@/components/HelpTip";
import { IN_APP_BROWSER_NOTICE_SHORT } from "@/lib/inAppBrowser";

type MicEntryGateProps = {
  busy: boolean;
  errorTitle?: string;
  errorBody?: string;
  showInAppHint?: boolean;
  onRequestMic: () => void;
  onListenOnly: () => void;
};

export function MicEntryGate({
  busy,
  errorTitle,
  errorBody,
  showInAppHint = false,
  onRequestMic,
  onListenOnly,
}: MicEntryGateProps) {
  return (
    <section
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 18,
        border: "1px solid #e5e7eb",
        background: "#fff",
        display: "grid",
        gap: 12,
      }}
      aria-label="通話参加の準備"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>通話の準備</div>
        <HelpTip
          label="通話の準備について"
          content="マイクを使って話すか、聞き専で参加できます。聞き専はマイクを使わず、他の参加者の音声だけ聞く参加方法です。後からマイクを許可して発話することもできます。"
        />
      </div>

      {errorTitle ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: 13,
            lineHeight: 1.65,
          }}
        >
          <div style={{ fontWeight: 900 }}>{errorTitle}</div>
          {errorBody ? <div style={{ marginTop: 6 }}>{errorBody}</div> : null}
          {showInAppHint ? (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 800 }}>アプリ内ブラウザの場合</span>
              <HelpTip
                label="アプリ内ブラウザについて"
                content={IN_APP_BROWSER_NOTICE_SHORT}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={onRequestMic}
        style={{
          padding: "12px 16px",
          borderRadius: 14,
          border: "1px solid #111827",
          background: "#111827",
          color: "#fff",
          fontWeight: 900,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "マイクを確認中…" : "マイクを許可して参加"}
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={onListenOnly}
        style={{
          padding: "10px 14px",
          borderRadius: 14,
          border: "1px solid #d1d5db",
          background: "#fff",
          color: "#374151",
          fontWeight: 800,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        聞き専で参加
      </button>
    </section>
  );
}
