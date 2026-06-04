"use client";

import { useMemo, useState } from "react";

type DiagnoseResult = {
  classExists: boolean;
  sessionExists: boolean;
  sessionClassMatches: boolean;
  membershipExists: boolean;
  sessionMemberExists: boolean;
  presenceExists: boolean;
  viewerInSessionMembers: boolean;
  counts: {
    classMemberships: number;
    sessionMembers: number;
    classPresence: number;
  };
  inconsistencies: string[];
  warnings: string[];
  possibleSplitSessions: Array<{
    sessionId: string;
    status: string;
    memberCount: number;
    createdAt: string | null;
    isTarget: boolean;
  }>;
  otherSessionsForDevice: Array<{
    sessionId: string;
    classId: string | null;
    joinedAt: string | null;
  }>;
  session: { status: string | null; topic: string | null } | null;
  class: { name: string | null } | null;
};

function shortId(id: string) {
  if (!id) return "-";
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function boolLabel(v: boolean) {
  return v ? "あり" : "なし";
}

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
  background: "#fff",
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  fontSize: 13,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  ...btn,
  background: "#fff",
  color: "#111",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 13,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

type Props = {
  initialClassId?: string;
  initialSessionId?: string;
  initialDeviceId?: string;
};

export default function ClassRepairPanel({
  initialClassId = "",
  initialSessionId = "",
  initialDeviceId = "",
}: Props) {
  const [classId, setClassId] = useState(initialClassId);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [deviceId, setDeviceId] = useState(initialDeviceId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [diagnose, setDiagnose] = useState<DiagnoseResult | null>(null);
  const [planned, setPlanned] = useState<string[]>([]);
  const [steps, setSteps] = useState<
    Array<{ step: string; status: string; action?: string; error?: string }>
  >([]);

  const repairConfirmText = useMemo(() => {
    if (!classId || !sessionId || !deviceId) {
      return "classId / sessionId / deviceId を入力してください。";
    }
    return (
      `deviceId=${shortId(deviceId)} を classId=${shortId(classId)} / sessionId=${shortId(sessionId)} に復旧します。\n\n` +
      "class_memberships / session_members / class_presence を upsert します（既存行は削除しません）。\n\nよろしいですか？"
    );
  }, [classId, sessionId, deviceId]);

  async function runDiagnose() {
    setBusy(true);
    setMsg("");
    setDiagnose(null);
    setPlanned([]);
    setSteps([]);

    try {
      const res = await fetch("/api/admin/class-repair/repair", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          sessionId,
          deviceId,
          dryRun: true,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const blocked = data?.diagnose ?? null;
        if (blocked) setDiagnose(blocked);
        const mismatch =
          data?.error === "session_class_mismatch" && data?.sessionClassId
            ? ` (session.class_id=${shortId(data.sessionClassId)})`
            : "";
        setMsg(`${data?.error ?? `診断失敗 (${res.status})`}${mismatch}`);
        return;
      }

      const repair = data.repair;
      setDiagnose(repair?.diagnose ?? null);
      setPlanned(repair?.planned ?? []);
      setSteps(repair?.steps ?? []);

      const planText =
        (repair?.planned ?? []).length > 0
          ? repair.planned.join(", ")
          : "修復予定なし（整合済み）";
      setMsg(`診断完了（dryRun）— 予定: ${planText}`);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "診断エラー");
    } finally {
      setBusy(false);
    }
  }

  async function runRepair() {
    if (!window.confirm(repairConfirmText)) return;

    setBusy(true);
    setMsg("");
    setPlanned([]);
    setSteps([]);

    try {
      const res = await fetch("/api/admin/class-repair/repair", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          sessionId,
          deviceId,
          confirm: true,
          dryRun: false,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        if (data?.diagnose) setDiagnose(data.diagnose);
        setMsg(data?.error ?? `修復失敗 (${res.status})`);
        return;
      }

      const repair = data.repair;
      setDiagnose(repair?.diagnose ?? null);
      setPlanned(repair?.planned ?? []);
      setSteps(repair?.steps ?? []);

      if (repair?.status === "partial") {
        setMsg(
          `一部のみ成功（${repair.failedStep} で失敗）: 完了=${(repair.actions ?? []).join(", ") || "なし"}`
        );
        return;
      }

      setMsg(
        `修復完了: ${(repair?.actions ?? []).join(", ") || "no-op"}`
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "修復エラー");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="class-repair" style={{ ...card, marginTop: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>
        クラス修復（管理者）
      </h2>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#666", lineHeight: 1.6 }}>
        メンバー消失・招待参加の不整合時に、membership / session_member / presence を
        upsert で復旧します。削除は行いません。
      </p>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        <label style={{ fontSize: 12, fontWeight: 800 }}>
          classId
          <input
            value={classId}
            onChange={(e) => setClassId(e.target.value.trim())}
            style={{ ...inputStyle, marginTop: 6 }}
            placeholder="uuid"
          />
        </label>
        <label style={{ fontSize: 12, fontWeight: 800 }}>
          sessionId
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value.trim())}
            style={{ ...inputStyle, marginTop: 6 }}
            placeholder="uuid"
          />
        </label>
        <label style={{ fontSize: 12, fontWeight: 800 }}>
          deviceId
          <input
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value.trim())}
            style={{ ...inputStyle, marginTop: 6 }}
            placeholder="uuid"
          />
        </label>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void runDiagnose()}
          disabled={busy}
          style={{ ...btnGhost, opacity: busy ? 0.6 : 1 }}
        >
          診断
        </button>
        <button
          type="button"
          onClick={() => void runRepair()}
          disabled={busy}
          style={{ ...btn, opacity: busy ? 0.6 : 1 }}
        >
          修復（確認あり）
        </button>
        {msg ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
            {msg}
          </span>
        ) : null}
      </div>

      {diagnose ? (
        <div style={{ marginTop: 14, fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>診断結果</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8,
            }}
          >
            <div>class: {boolLabel(diagnose.classExists)}</div>
            <div>session: {boolLabel(diagnose.sessionExists)}</div>
            <div>membership: {boolLabel(diagnose.membershipExists)}</div>
            <div>session_member: {boolLabel(diagnose.sessionMemberExists)}</div>
            <div>presence: {boolLabel(diagnose.presenceExists)}</div>
            <div>一覧に含まれる: {boolLabel(diagnose.viewerInSessionMembers)}</div>
          </div>

          <div style={{ marginTop: 10 }}>
            件数 — memberships: {diagnose.counts.classMemberships} / session_members:{" "}
            {diagnose.counts.sessionMembers} / presence: {diagnose.counts.classPresence}
          </div>

          {diagnose.class?.name ? (
            <div style={{ marginTop: 6 }}>クラス名: {diagnose.class.name}</div>
          ) : null}

          {diagnose.inconsistencies.length > 0 ? (
            <div style={{ marginTop: 10, color: "#b45309", fontWeight: 800 }}>
              不整合: {diagnose.inconsistencies.join(", ")}
            </div>
          ) : null}

          {diagnose.warnings.length > 0 ? (
            <div style={{ marginTop: 8, color: "#92400e" }}>
              警告（自動削除なし）: {diagnose.warnings.join(", ")}
            </div>
          ) : null}

          {planned.length > 0 ? (
            <div style={{ marginTop: 10, fontWeight: 800 }}>
              修復予定（dryRun）: {planned.join(", ")}
            </div>
          ) : null}

          {steps.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 800 }}>ステップ</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {steps.map((s) => (
                  <li key={`${s.step}-${s.status}`}>
                    {s.step}: {s.status}
                    {s.action ? ` (${s.action})` : ""}
                    {s.error ? ` — ${s.error}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {diagnose.possibleSplitSessions.length > 1 ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800 }}>同一 class 内の session</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {diagnose.possibleSplitSessions.map((s) => (
                  <li key={s.sessionId}>
                    {s.isTarget ? "★ " : ""}
                    {shortId(s.sessionId)} — {s.status} — 参加者 {s.memberCount}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {diagnose.otherSessionsForDevice.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 800 }}>同一 device の他 session</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {diagnose.otherSessionsForDevice.map((s) => (
                  <li key={s.sessionId}>
                    session {shortId(s.sessionId)} / class {shortId(s.classId ?? "")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
