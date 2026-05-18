"use client";

type Props = {
  myDeviceId: string;
  targetDeviceId: string;
  targetName: string;
  sessionId?: string;
  classId?: string;
};

async function readJsonSafe(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function MemberModerationButtons({
  myDeviceId,
  targetDeviceId,
  targetName,
  sessionId,
  classId,
}: Props) {
  async function reportMember() {
    const reason =
      window.prompt(
        `${targetName}さんを通報します。\n理由を入力してください。\n\n迷惑行為 / 性的な発言・行為 / 嫌がらせ / スパム / その他`,
        "迷惑行為"
      ) ?? "";

    const cleanReason = reason.trim();
    if (!cleanReason) return;

    const detail =
      window.prompt("詳細があれば入力してください（任意）", "") ?? "";

    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reporterDeviceId: myDeviceId,
        targetDeviceId,
        sessionId,
        classId,
        reason: cleanReason,
        detail: detail.trim(),
      }),
    });

    const json = await readJsonSafe(res);

    if (!res.ok || !json?.ok) {
      alert(json?.error ?? "通報に失敗しました");
      return;
    }

    alert("通報しました");
  }

  async function blockMember() {
    if (!confirm(`${targetName}さんをブロックしますか？`)) return;

    const res = await fetch("/api/block", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blockerDeviceId: myDeviceId,
        blockedDeviceId: targetDeviceId,
      }),
    });

    const json = await readJsonSafe(res);

    if (!res.ok || !json?.ok) {
      alert(json?.error ?? "ブロックに失敗しました");
      return;
    }

    alert("ブロックしました");
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => void reportMember()}
        style={{
          border: "1px solid #fbbf24",
          background: "#fffbeb",
          color: "#92400e",
          borderRadius: 999,
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        通報
      </button>

      <button
        type="button"
        onClick={() => void blockMember()}
        style={{
          border: "1px solid #fecaca",
          background: "#fff1f2",
          color: "#b91c1c",
          borderRadius: 999,
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        ブロック
      </button>
    </div>
  );
}